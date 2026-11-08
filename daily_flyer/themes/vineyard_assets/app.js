import { renderVisualEstate } from './estate-visuals.js';
const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const esc = value => String(value ?? '').replace(/[&<>'\u0022]/g, char => `&#${char.charCodeAt(0)};`);
const words = value => String(value || '').replaceAll('_', ' ').replace(/\b\w/g, letter => letter.toUpperCase());
const read = (key, fallback) => { try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; } };
const write = (key, value) => { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* Private browsing may deny storage. */ } };
const PREF_KEY = 'vineyard-table-preferences-v1';
const SESSION_KEY = 'vineyard-table-session-v1';
const guidanceNames = ['Simple', 'Moderate', 'Expert'];
const guidanceText = [
  'Learn as you play. See what to do next, why it helps, and what your choice will cost.',
  'A little context. Keep seasonal reminders and clear action previews, with help when you want it.',
  'Your table, your decisions. A compact board with the full rules always within reach.'
];
const prefs = { guidance: 0, theme: 'night', scale: 100, sound: false, coaching: true, motion: true, ...read(PREF_KEY, {}) };
prefs.guidance = Math.max(0, Math.min(2, Number(prefs.guidance) || 0));
const state = {
  screen: 'home', room: null, game: null, session: read(SESSION_KEY, null), panel: 'board',
  handTab: 'orders', previewSeason: null, busy: false, online: true, polling: false,
  lastSignature: '', modal: null, pollTimer: null, lastPhase: null, retryDelay: 1600,
  joinCode: (new URLSearchParams(location.search).get('room') || '').replace(/[^a-z0-9]/gi, '').toUpperCase(),
  name: read('vineyard-table-name', ''), setup: { bots: 1, target: 20 }
};

const paths = {
  rooster: 'M7 14c-5-1-5-6-3-9l2 4 2-5 2 5c2-3 5-3 7-1l2-1 2 3-3 1c0 5-3 7-8 7H7Zm4 4v4m4-5 1 5M9 22h4m1 0h4M14 6l-1-3 3 1 1 2',
  bottle: 'M10 2h4v5l3 4v10H7V11l3-4V2Zm-2 12h8M10 5h4',
  barrel: 'M7 3c-4 4-4 14 0 18h10c4-4 4-14 0-18H7ZM5 7h14M4 17h16M9 3v18m6-18v18',
  leaf: 'M19 3C8 2 3 7 5 14c2 7 12 7 14-11ZM5 20 15 9M9 15l-1-5m5 1 4 1',
  wine: 'M7 3h10l1 7c0 4-3 6-6 6s-6-2-6-6l1-7ZM12 16v5m-4 0h8M7 9h10',
  sun: 'M12 3v2m0 14v2M3 12h2m14 0h2M5.6 5.6 7 7m10 10 1.4 1.4M5.6 18.4 7 17m10-10 1.4-1.4M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z',
  moon: 'M20 15A9 9 0 0 1 9 4a9 9 0 1 0 11 11Z',
  grape: 'M12 6V2m0 3c3-3 5-2 7-1m-10 4a3 3 0 1 0 0 6 3 3 0 0 0 0-6Zm6 0a3 3 0 1 0 0 6 3 3 0 0 0 0-6Zm-3 5a3 3 0 1 0 0 6 3 3 0 0 0 0-6Zm0 6v2',
  home: 'M3 11 12 3l9 8M5 10v11h14V10M9 21v-7h6v7',
  card: 'M5 3h14v18H5zM8 7h8M8 11h8m-8 4h5',
  log: 'M7 3h14v18H7zM3 7h8M3 12h8M3 17h8m3-10h4m-4 5h4m-4 5h4',
  people: 'M9 7a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm12 0a3 3 0 1 1-6 0 3 3 0 0 1 6 0ZM1 20v-4c0-4 10-4 10 0v4m2 0v-4c0-4 10-4 10 0v4',
  check: 'm5 12 4 4L19 6',
  arrow: 'M4 12h16m-6-6 6 6-6 6',
  close: 'm6 6 12 12M6 18 18 6',
  settings: 'M12 3v4m0 10v4M3 12h4m10 0h4M5.6 5.6l3 3m6.8 6.8 3 3M5.6 18.4l3-3m6.8-6.8 3-3M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z',
  worker: 'M12 2a3 3 0 1 0 0 6 3 3 0 0 0 0-6ZM8 9 3 14l2 2 3-2-2 7h5l1-5 1 5h5l-2-7 3 2 2-2-5-5Z',
  coin: 'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0ZM14.5 8h-3a2 2 0 0 0 0 4h1a2 2 0 0 1 0 4h-3M12 6v12',
  trophy: 'M8 3h8v7c0 6-8 6-8 0V3Zm0 2H4v4c0 3 4 3 4 3m8-7h4v4c0 3-4 3-4 3m-4 2v7m-4 0h8',
  snow: 'M12 2v20M3.3 7l17.4 10M3.3 17 20.7 7M9 4l3 3 3-3M9 20l3-3 3 3',
  build: 'M4 21V10l8-7 8 7v11H4Zm4 0v-8h8v8M2 10l10-9 10 9',
  help: 'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0ZM9 9a3 3 0 0 1 6 0c0 2-3 2-3 4m0 3v1',
  share: 'M12 15V3m-4 4 4-4 4 4M5 11H3v10h18V11h-2',
  sound: 'M3 9v6h4l5 4V5L7 9H3Zm13-2c4 3 4 7 0 10m2-13c6 5 6 11 0 16'
};
function icon(name, className = '') {
  return `<svg class='ui-icon ${esc(className)}' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='1.6' stroke-linecap='round' stroke-linejoin='round' aria-hidden='true'><path d='${paths[name] || paths.leaf}'/></svg>`;
}
const actionIcons = { draw_vine: 'leaf', plant: 'leaf', build: 'build', tour: 'wine', trade: 'coin', summer_visitor: 'people', harvest: 'grape', make_wine: 'wine', draw_order: 'card', fill_order: 'trophy', train: 'worker', winter_visitor: 'people', work: 'coin', yoke: 'grape' };
const placeFor = {draw_vine:'vine',plant:'plant',build:'build',tour:'tour',trade:'trade',summer_visitor:'summer',harvest:'harvest',make_wine:'make',fill_order:'fill',draw_order:'order',train:'train',winter_visitor:'winter'};
const phaseNames = { spring: 'Spring', summer: 'Summer', autumn: 'Autumn', winter: 'Winter', discard: 'Year end', finished: 'The final vintage' };
const phaseCopy = {
  spring: 'Choose your place in the wake-up order. Earlier starts give you first choice of spaces; later starts offer a bonus.',
  summer: 'Grow your estate. Plant vines, build structures, and earn coins. Save some workers for winter.',
  autumn: 'Welcome a visitor to your estate. Choose a summer or winter card for your hand.',
  winter: 'Bring in the harvest, make wine, and fill orders. Your vines stay planted for future years.',
  discard: 'The vintage is complete. Keep up to seven cards before the next year.',
  finished: 'The final year is complete. Compare the estates and start a new vintage.'
};

function applyPreferences() {
  document.documentElement.dataset.visual = 'tabletop';
  document.documentElement.dataset.theme = prefs.theme === 'day' ? 'day' : 'night';
  document.documentElement.dataset.guidance = guidanceNames[prefs.guidance].toLowerCase();
  document.documentElement.dataset.motion = prefs.motion ? 'on' : 'off';
  document.documentElement.style.setProperty('--control-scale', Math.max(1, Math.min(1.3, prefs.scale / 100)));
  document.documentElement.style.setProperty('--ui-scale', Math.max(1, Math.min(1.3, prefs.scale / 100)));
  write(PREF_KEY, prefs);
  syncAmbient();
}
let toastTimer;
function toast(message, danger = false) {
  const node = $('#toast');
  node.textContent = message;
  node.className = `is-visible${danger ? ' is-error' : ''}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => node.className = '', danger ? 8000 : 4400);
}
let guidanceId = 0;
function guidanceControl() {
  const id = `guidance-slider-${++guidanceId}`;
  return `<div class='guidance-control'><div class='control-heading'><label for='${id}'>Your guidance</label><span class='guidance-value'>${guidanceNames[prefs.guidance]}</span></div><input id='${id}' type='range' min='0' max='2' step='1' value='${prefs.guidance}' data-pref='guidance' aria-valuetext='${guidanceNames[prefs.guidance]}'><div class='range-labels'><span>Simple</span><span>Moderate</span><span>Expert</span></div><p class='guidance-description'>${guidanceText[prefs.guidance]}</p><small>Same rules. Your own level of help.</small></div>`;
}

function renderHome() {
  const saved = state.session;
  $('#app').innerHTML = `<div class='welcome'>
    <section class='hero'>
      <div class='hero-copy'><span class='eyebrow'>DAILY FLYER · A GAME AROUND THE TABLE</span><h1 class='display-title'>Good things<br>take <em>seasons.</em></h1><p class='lead'>A few workers. A little land. A vineyard to make your own.</p><p class='hero-description'>Plant your first vines, age a remarkable wine, and find the right moment to fill an order. Every worker has a season. Every choice has a cost.</p><div class='pill-row'><span class='pill'>${icon('people')} 1–6 people</span><span class='pill'>${icon('worker')} Turn based</span><span class='pill'>${icon('leaf')} Learn as you play</span></div></div>
      <div class='hero-art' role='img' aria-label='Hand-painted Tuscan vineyard, stone farmhouse, cypresses and rolling hills'><div class='vintage-seal'>ESTATE No. 01<span>YOUR FIRST VINTAGE</span></div></div>
    </section>
    ${saved ? `<section class='resume-card'><div>${icon('wine')}<span><strong>Your table is waiting</strong><small>Room ${esc(saved.code)} · saved on this device</small></span></div><button class='secondary' data-act='resume'>Return to table ${icon('arrow')}</button></section>` : ''}
    <div class='home-grid'>
      <section class='setup-card'><div class='section-heading'><span class='section-number'>01</span><div><span class='eyebrow'>PULL UP A CHAIR</span><h2>Start a vintage</h2></div></div>
        <div class='setup-fields'><label class='field'><span>Your name</span><input id='player-name' maxlength='24' autocomplete='nickname' placeholder='Your name or estate' value='${esc(state.name)}'></label><div class='field-pair'><label class='field'><span>AI estates</span><select id='bot-count'>${[1,2,3,4,5].map(n=>`<option value='${n}' ${state.setup.bots===n?'selected':''}>${n} ${n===1?'opponent':'opponents'}</option>`).join('')}</select></label><label class='field'><span>Finish line</span><select id='point-target'><option value='20' ${state.setup.target===20?'selected':''}>20 points · full game</option><option value='12' ${state.setup.target===12?'selected':''}>12 points · short game</option></select></label></div></div>
        <button class='primary full-width' data-act='solo'>Play solo ${icon('arrow')}</button><button class='secondary full-width' data-act='host'>${icon('people')} Host a table with friends</button><p class='form-note'>Play solo against AI estates, or invite friends with a room code. A short game uses the same rules.</p>
      </section>
      <section class='experience-card'><div class='section-heading'><span class='section-number'>02</span><div><span class='eyebrow'>MAKE YOURSELF AT HOME</span><h2>A little guidance?</h2></div></div>${guidanceControl()}<button class='text-button' data-act='learn'>${icon('help')} First time? Learn by playing</button><div class='join-block'><label class='field'><span>Joining friends?</span><input id='join-code' maxlength='12' autocomplete='off' autocapitalize='characters' placeholder='ROOM CODE' value='${esc(state.joinCode)}'></label><button class='secondary' data-act='join'>Join table ${icon('arrow')}</button></div></section>
    </div>
    <section class='how-strip' aria-label='The winemaking journey'><div><span>01</span>${icon('leaf')}<strong>Plant</strong><small>Give your estate a future.</small></div><div><span>02</span>${icon('grape')}<strong>Harvest</strong><small>Bring the grapes home.</small></div><div><span>03</span>${icon('wine')}<strong>Make & age</strong><small>Let your cellar do its work.</small></div><div><span>04</span>${icon('trophy')}<strong>Fill orders</strong><small>Turn a good vintage into points.</small></div></section>
    <footer class='home-footer'><p><strong>Vineyard Table</strong> · An independent game inspired by Viticulture.</p><button class='text-button' data-act='about'>About this edition</button><button class='text-button' data-act='restore-dialog'>Restore a backup</button></footer>
  </div>`;
  updateHeader();
}
function updateHeader() {
  const el = $('#connection-status');
  if (el) { el.textContent = state.screen==='home' ? 'A DAILY FLYER GAME' : state.online ? `TABLE ${state.room?.code || ''}` : 'RECONNECTING'; el.classList.toggle('is-offline', !state.online); }
  const home = $('#home-button');
  if (home) home.setAttribute('aria-label', state.screen === 'home' ? 'Vineyard Table home' : 'Return home; your table stays saved');
}
function captureSetup() {
  state.name = ($('#player-name')?.value || state.name || 'My Estate').trim().slice(0,24) || 'My Estate';
  state.setup.bots = Number($('#bot-count')?.value || state.setup.bots);
  state.setup.target = Number($('#point-target')?.value || state.setup.target);
  state.joinCode = ($('#join-code')?.value || state.joinCode).trim().toUpperCase().replace(/[^A-Z0-9]/g,'');
  write('vineyard-table-name', state.name);
}
function me() { return state.game?.players.find(p=>p.id===state.room?.youId) || state.game?.players.find(p=>p.id===state.game?.you?.id); }
function currentPlayer() { return state.game?.players.find(p=>p.id===state.game?.activePlayerId); }
function isMyTurn() { return state.game?.activePlayerId === state.room?.youId && state.game?.status !== 'finished'; }
function coin(value) { return `<span class='inline-stat'>${icon('coin')} ${esc(value)}</span>`; }
function score(value) { return `<span class='inline-stat'>${icon('trophy')} ${esc(value)}</span>`; }
function workerCount(player) { return (player?.workers?.available || 0) + (player?.workers?.grandeAvailable ? 1 : 0); }
function playerBoard(compact = false) {
  return `<div class='scoreboard ${compact?'is-compact':''}'>${state.game.players.map(player=>`<button class='player-tile ${player.id===state.game.activePlayerId?'is-active':''} ${player.id===state.room.youId?'is-you':''}' data-act='inspect-player' data-id='${esc(player.id)}' style='--player-color:${esc(player.color)}' aria-label='Inspect ${esc(player.name)} estate, ${player.score} points'><span class='player-marker'>${icon('worker')}</span><span class='player-name'>${esc(player.name)}<small>${player.id===state.room.youId?'You':player.bot?'AI estate':player.passed?'Passed':player.id===state.game.activePlayerId?'Thinking…':'At the table'}</small></span><span class='player-score'>${player.score}<small>VP</small></span><span class='player-resources'>${coin(player.coins)}<span>${icon('worker')} ${workerCount(player)}</span></span></button>`).join('')}</div>`;
}
function renderLobby() {
  const r = state.room;
  const host = r.hostId===r.youId;
  $('#app').innerHTML = `<section class='lobby-screen'><div class='lobby-intro'><span class='eyebrow'>THE TABLE IS SET</span><h1>Room for a good vintage.</h1><p>Share the room code or invitation link. Everyone keeps their own cards and guidance settings.</p></div><div class='lobby-grid'><section class='setup-card'><span class='eyebrow'>YOUR ROOM CODE</span><div class='room-code'>${esc(r.code)}</div><div class='button-row'><button class='primary' data-act='share'>${icon('share')} Invite friends</button><button class='secondary' data-act='copy-code'>Copy code</button></div><p class='form-note'>Open this room on another device to join. Your seat is remembered here.</p><div class='lobby-seats'>${r.players.map((p,i)=>`<div class='lobby-seat'><span class='seat-number'>0${i+1}</span>${icon('worker')}<strong>${esc(p.name)}</strong><span class='pill'>${p.id===r.hostId?'Host':p.bot?'AI':'Joined'}</span></div>`).join('')}${r.players.length<6?`<div class='lobby-seat is-empty'>${icon('people')} Waiting for another estate…</div>`:''}</div></section><section class='experience-card'>${guidanceControl()}<hr><p><strong>${r.target} points</strong> starts the final-year countdown.</p>${host?`<label class='field'><span>Add AI estates</span><select id='lobby-bots'>${Array.from({length:7-r.players.length},(_,i)=>`<option value='${i}' ${i===(r.players.length===1?1:0)?'selected':''}>${i===0?'Friends only':i+' AI '+(i===1?'estate':'estates')}</option>`).join('')}</select></label><button class='primary full-width' data-act='start'>Start the first year ${icon('arrow')}</button><p class='form-note'>At least two estates are needed. Invite friends or add AI.</p>`:`<div class='waiting-note'>${icon('leaf')} Waiting for the host to start. You can adjust your guidance while you wait.</div>`}<button class='text-button' data-act='backup'>Save a recovery backup</button></section></div></section>`;
  updateHeader();
}
function guideCard() {
  const game = state.game;
  if (prefs.guidance===2 || !prefs.coaching) return `<button class='coach-restore text-button' data-act='explain'>${icon('help')} ${prefs.guidance===2?'Rules for this turn':'Show help for this turn'}</button>`;
  const guide = game.guide || {headline:phaseNames[game.phase],body:phaseCopy[game.phase]};
  const recommendation = game.legalActions.find(action=>action.key===guide.recommendedKey);
  return `<section class='guide-card ${prefs.guidance===1?'is-brief':''}' aria-label='Turn guidance'><div class='guide-icon'>${icon('leaf')}</div><div class='guide-content'><span class='eyebrow'>${prefs.guidance===0?'A HAND WITH THIS TURN':'SEASON NOTE'}</span><h3>${esc(prefs.guidance===0?guide.headline:phaseNames[game.phase])}</h3><p>${esc(prefs.guidance===0?guide.body:phaseCopy[game.phase])}</p>${prefs.guidance===0&&recommendation&&isMyTurn()?`<button class='text-button' data-act='inspect-key' data-key='${esc(recommendation.key)}'>Explore: ${esc(recommendation.label)} ${icon('arrow')}</button>`:''}</div><button class='icon-button guide-dismiss' data-act='hide-coaching' aria-label='Hide coaching, keeping your guidance level'>${icon('close')}</button></section>`;
}
function renderGame() {
  document.body.dataset.panel=state.panel;
  const game = state.game;
  if (!game) return;
  const player = me();
  const turn = currentPlayer();
  const done = game.status==='finished' || game.phase==='finished';
  const handCount = Object.values(game.you?.hand || {}).reduce((sum,cards)=>sum+cards.length,0);
  $('#app').innerHTML = `<div class='table-screen'>
    <div class='game-banner'><div class='vintage-heading'><span class='eyebrow'>${done?'THE LAST GLASS':'YOUR VINEYARD, YEAR '+game.year}</span><h1>${esc(done?'The final vintage':phaseNames[game.phase] || game.phase)}<span class='season-decoration'>${icon(game.phase==='winter'?'snow':game.phase==='summer'?'sun':'leaf')}</span></h1></div><div class='season-nav' aria-label='The year'>${['spring','summer','autumn','winter'].map((phase,i)=>`<span class='season-step ${game.phase===phase?'is-active':''}'><b>${icon(['leaf','sun','grape','snow'][i])}</b>${phaseNames[phase]}</span>`).join('')}</div><div class='table-tools'><span class='pill'>${game.finalYear?'Final year':game.target+' VP to trigger final year'}</span><button class='icon-button' data-act='share' aria-label='Share table'>${icon('share')}</button></div></div>
    ${done?renderFinal():`<div class='turn-banner ${isMyTurn()?'is-your-turn':''}' role='status'><span class='turn-light'></span><strong>${isMyTurn()?'Your turn':esc(turn?.name || 'The table')+'’s turn'}</strong><span>${isMyTurn()?`${workerCount(player)} ${workerCount(player)===1?'worker':'workers'} available${game.phase==='summer'?' for the whole year':''}`:'Your estate and cards are still yours to inspect.'}</span>${!state.online?`<span class='network-note'>Reconnecting…</span>`:''}${game.pending?`<span class='pill'>${esc(game.pending.label)}</span>`:''}</div>`}
    ${reputationMarkup()}<div class='mobile-scoreboard'>${playerBoard(true)}</div>
    <div class='game-shell' data-mobile-panel='${state.panel}' data-center-panel='${state.panel}'>
      <aside class='table-sidebar'><div class='section-label'><span>AROUND THE TABLE</span><small>Room ${esc(state.room.code)}</small></div>${playerBoard()}${handDock()}<div class='sidebar-bottom'><div class='guidance-mini'><label for='game-guidance'>Guidance <b>${guidanceNames[prefs.guidance]}</b></label><input id='game-guidance' type='range' min='0' max='2' step='1' value='${prefs.guidance}' data-pref='guidance' aria-valuetext='${guidanceNames[prefs.guidance]}'><div class='range-labels'><span>Simple</span><span>Moderate</span><span>Expert</span></div></div>${journeyMarkup()}<button class='text-button' data-act='backup'>${icon('card')} Save recovery backup</button></div></aside>
      <section class='game-board'>
        <nav class='desktop-tabs' aria-label='Table views'>${[['board','The board','home'],['hand','Your cards','card'],['log','Vintage journal','log']].map(([id,label,ico])=>`<button class='${state.panel===id||state.panel==='estate'&&id==='board'?'is-active':''}' data-act='panel' data-panel='${id}'>${icon(ico)}${label}${id==='hand'?` <span>${handCount}</span>`:''}</button>`).join('')}</nav>
        ${state.panel==='hand'?renderHand():state.panel==='log'?renderJournal():`${!done?guideCard():''}${renderBoard()}`}
      </section>
      <aside class='estate-panel'>${renderEstate(player,true)}</aside>
    </div>
    <nav class='nav-tabs' aria-label='Game navigation'>${[['board','Board','home'],['estate','Estate','leaf'],['hand','Cards','card'],['log','Journal','log']].map(([id,label,ico])=>`<button class='${state.panel===id?'is-active':''}' data-act='panel' data-panel='${id}' aria-current='${state.panel===id?'page':'false'}'>${icon(ico)}<span>${label}</span>${id==='hand'?`<small>${handCount}</small>`:''}</button>`).join('')}</nav>
  </div>`;
  updateHeader();
}
function reputationMarkup() {
  const game=state.game;
  return `<section class='reputation-strip' aria-label='Reputation track'><div class='reputation-label'>${icon('trophy')}<strong>Reputation</strong><small>${game.target} starts the final year</small></div><div class='reputation-track'>${Array.from({length:game.target+1},(_,value)=>`<div class='reputation-step ${value===game.target?'is-finish':''}'><span class='track-number'>${value}${value===game.target?'+':''}</span><div class='score-markers'>${game.players.filter(p=>Math.max(0,Math.min(game.target,p.score))===value).map(p=>`<span class='score-stone' style='--player-color:${esc(p.color)}' title='${esc(p.name)} · ${p.score} VP' aria-label='${esc(p.name)}: ${p.score} victory points'>${esc([...p.name.trim()][0]||'V')}</span>`).join('')}</div></div>`).join('')}</div></section>`;
}
function handDock() {
  const hand=state.game.you?.hand || {};
  return `<section class='board-decks' aria-label='Your card families'><div class='section-label'><span>YOUR CARDS</span><small>Tap to inspect</small></div><div class='deck-row'>${[['vines','Vines','leaf'],['orders','Orders','bottle'],['summer','Summer','sun'],['winter','Winter','snow']].map(([kind,label,ico])=>`<button class='deck-pile' data-deck='${kind}' data-act='hand-shortcut' data-tab='${kind}' aria-label='Inspect ${hand[kind]?.length||0} ${{vines:'vine',orders:'order',summer:'summer visitor',winter:'winter visitor'}[kind]} ${(hand[kind]?.length||0)===1?'card':'cards'}'><span class='deck-emblem'>${icon(ico)}</span><b class='deck-count'>${hand[kind]?.length||0}</b><span class='deck-label'>${label}</span></button>`).join('')}</div></section>`;
}
function boardLandscape(season) {
  const captions={spring:['The first light','An early start, or a little help along the way.'],summer:['A summer in the valley','Vines, visitors, and the promise of a good vintage.'],autumn:['Guests at the gate','An invitation can change the year ahead.'],winter:['The winter vintage','Bring in the grapes. Open the cellar. Fill the orders.']};
  const [title,copy]=captions[season]||captions.summer;
  return `<div class='board-landscape' data-season='${esc(season)}'><div class='landscape-caption'><span class='eyebrow'>THE SHARED VINEYARD</span><h2>${title}</h2><p>${copy}</p></div><span class='vintage-counter'>YEAR <b>${state.game.year}</b></span></div>`;
}
function journeyMarkup() {
  if (prefs.guidance!==0 || !prefs.coaching) return '';
  const steps = state.game.guide?.steps || [];
  return `<div class='journey-steps'><span class='eyebrow'>FROM VINE TO VICTORY</span>${steps.map((step,i)=>`<div class='journey-step ${step.done?'is-done':''}'><span>${step.done?icon('check'):i+1}</span><div><strong>${esc(step.label)}</strong><small>${esc(step.detail)}</small></div></div>`).join('')}</div>`;
}
function renderBoard() {
  const game = state.game;
  const turn = isMyTurn();
  if (game.phase==='spring') return `<div class='season-board spring-board'>${boardLandscape('spring')}<div class='board-heading'><span class='eyebrow'>BEFORE THE DAY BEGINS</span><h2>The wake-up track</h2><p>Take an early start, or trade a later turn for a little help.</p></div><div class='wake-track'>${game.wakeTrack.map(row=>{const owner=game.players.find(p=>p.id===row.playerId);return `<div class='wake-row ${owner?'is-taken':''}'><span class='wake-number'>${row.row}</span><div><strong>${esc(row.bonus)}</strong><small>${owner?esc(owner.name):'Available'}</small></div><span class='wake-symbols' aria-hidden='true'>${icon(['sun','leaf','card','coin','people','trophy','worker'][row.row-1])}</span><span class='wake-marker' style='--player-color:${esc(owner?.color||'#6e7e69')}'>${owner?icon('rooster','wake-rooster'):''}</span></div>`;}).join('')}</div>${turn?`<button class='primary full-width' data-act='action-group' data-group='wake'>Choose your start ${icon('arrow')}</button>`:`<p class='waiting-note'>Waiting for ${esc(currentPlayer()?.name)} to choose a wake-up position.</p>`}</div>`;
  if (game.phase==='autumn') return `<div class='season-board autumn-board'>${boardLandscape('autumn')}<div class='board-heading'><span class='eyebrow'>A KNOCK AT THE GATE</span><h2>A visitor for your estate</h2><p>Visitors create opportunities. Summer visitors help your estate grow; winter visitors help bring in the vintage.</p></div><div class='season-choices'>${game.legalActions.filter(a=>a.group==='visitor').map(a=>`<button class='season-choice' data-act='inspect-key' data-key='${esc(a.key)}'><span class='card-illustration' data-place='${a.label.toLowerCase().includes('winter')?'winter':'summer'}' aria-hidden='true'></span>${icon(a.label.toLowerCase().includes('winter')?'snow':'sun')}<strong>${esc(a.label)}</strong><span>${esc(a.detail)}</span>${icon('arrow')}</button>`).join('')||`<div class='waiting-note'>${esc(currentPlayer()?.name)} is welcoming a visitor.</div>`}</div></div>`;
  if (game.phase==='discard') return `<div class='season-board'><div class='board-heading'><span class='eyebrow'>PUT THE YEAR TO BED</span><h2>A hand of seven</h2><p>Choose cards to let go. Everything else in your estate stays with you.</p></div>${turn?`<button class='primary' data-act='action-group' data-group='discard'>Choose a card to discard</button>`:`<p class='waiting-note'>${esc(currentPlayer()?.name)} is choosing which cards to keep.</p>`}${renderHand()}</div>`;
  if (game.status==='finished' || game.phase==='finished') return `<div class='season-board'><div class='board-heading'><span class='eyebrow'>A SEASON WELL SPENT</span><h2>Your vineyard tells a story.</h2><p>Explore the estates, review your vintage journal, or bring everyone back for another game.</p></div><div class='button-row'><button class='secondary' data-act='panel' data-panel='log'>Read the journal ${icon('log')}</button>${state.room.hostId===state.room.youId?`<button class='primary' data-act='rematch-confirm'>Another vintage ${icon('arrow')}</button>`:`<span class='waiting-note'>The host can start another vintage.</span>`}</div></div>`;
  const season = state.previewSeason || game.phase;
  const rows = game.board.filter(space=>space.season===season || ['any','all','both'].includes(space.season));
  const main = rows.filter(space=>!['work','yoke'].includes(space.id));
  const extras = rows.filter(space=>['work','yoke'].includes(space.id));
  const pass = game.legalActions.find(a=>a.group==='pass');
  return `<div class='season-board ${esc(season)}-board'>${boardLandscape(season)}<div class='board-heading'><div><span class='eyebrow'>THE VILLAGE & YOUR VINEYARD</span><h2>${season==='summer'?'Lay the groundwork.':'Make this year count.'}</h2></div><div class='season-switch' aria-label='Preview seasonal spaces'>${['summer','winter'].map(s=>`<button class='${season===s?'is-active':''}' data-act='preview-season' data-season='${s}'>${icon(s==='summer'?'sun':'snow')}${words(s)}</button>`).join('')}</div></div>${season!==game.phase?`<div class='planning-note'>You’re looking ahead to ${esc(season)}. It is still ${esc(game.phase)}.</div>`:''}${game.pending?`<div class='continuation-banner'>${icon('wine')}<span><strong>${esc(game.pending.label)}</strong> ${esc(game.pending.remaining!==undefined?game.pending.remaining+' more available':'')}</span></div>`:''}<div class='action-grid'>${main.map(renderSpace).join('')}</div>${extras.length?`<div class='utility-spaces'>${extras.map(renderSpace).join('')}</div>`:''}<div class='board-actions'><div class='available-workers'>${icon('worker')}<div><strong>${workerCount(me())} ${workerCount(me())===1?'worker':'workers'} available</strong><small>${game.phase==='summer'?'Keep some for winter. Workers return next year.':'Workers return when the year is complete.'}</small></div></div><button class='${pass?'secondary':'ghost'}' data-act='inspect-key' data-key='${esc(pass?.key||'')}' ${!pass?'disabled':''}>${esc(pass?.label || (game.phase==='summer'?'Pass to winter':'Finish your winter'))} ${icon('arrow')}</button></div></div>`;
}
function actionSymbols(id) {
  const chip=(ico,label='')=>`<span>${icon(ico)}${label?`<b>${label}</b>`:''}</span>`;
  const arrow=`<i>→</i>`;
  return ({draw_vine:chip('leaf','+1'),plant:chip('leaf')+arrow+chip('home'),build:chip('coin')+arrow+chip('build'),tour:chip('coin','+2'),trade:chip('grape')+'<i>↔</i>'+chip('coin'),summer_visitor:chip('card')+arrow+chip('sun'),harvest:chip('leaf')+arrow+chip('grape'),make_wine:chip('grape')+arrow+chip('bottle','≤2'),draw_order:chip('card','+1'),fill_order:chip('bottle')+arrow+chip('trophy'),train:chip('coin','4')+arrow+chip('worker'),winter_visitor:chip('card')+arrow+chip('snow'),work:chip('coin','+1'),yoke:chip('grape')})[id]||'';
}
function renderSpace(space) {
  const game=state.game;
  const actions=game.legalActions.filter(a=>a.group===space.id);
  const suggested=prefs.guidance===0 && prefs.coaching && actions.some(a=>a.key===game.guide?.recommendedKey);
  const occupancy=space.occupied||[];
  const capacity=Number.isFinite(space.capacity)?space.capacity:0;
  const piece=(place)=>`<span class='meeple-piece ${place.worker==='grande'?'is-grande':''}'>${icon('worker')}${place.worker==='grande'?'<b>G</b>':''}</span>`;
  const slots=Array.from({length:Math.min(capacity,3)},(_,i)=>{const place=space.id==='yoke'?occupancy[0]:occupancy.find(item=>item.slot===i),owner=game.players.find(p=>p.id===place?.playerId);return `<span class='worker-slot ${place?'is-filled':''} ${place?.worker==='grande'?'is-grande':''} ${i===1?'is-bonus':''}' title='${esc(owner?owner.name+(place.worker==='grande'?' · grande':''):i===1?'Bonus: '+space.bonus:'Open worker space')}' style='--player-color:${esc(owner?.color||'#81755b')}'>${place?piece(place):i===1?'<span>＋</span>':'<i></i>'}</span>`;}).join('');
  const overflow=occupancy.filter(place=>place.slot<0&&place.worker==='grande'&&!['work','yoke'].includes(space.id));
  const utility=['work','yoke'].includes(space.id);
  const location=placeFor[space.id]||'';
  const placed=overflow.map(place=>`<span class='grande-overflow' title='${esc(game.players.find(p=>p.id===place.playerId)?.name||'Grande worker')}' style='--player-color:${esc(game.players.find(p=>p.id===place.playerId)?.color||'#9dbb90')}'>${piece(place)}</span>`).join('');
  return `<button class='action-space ${actions.length?'is-available':'is-disabled'} ${suggested?'is-suggested':''} ${utility?'is-utility':''}' data-season='${esc(space.season)}' data-place='${location}' data-act='action-group' data-group='${esc(space.id)}' aria-label='${esc(space.title)}${actions.length?'':', inspect requirements'}'><div class='location-art ${utility?'location-utility':''}' data-place='${location}' aria-hidden='true'>${utility?`<span class='utility-emblem'>${icon(actionIcons[space.id])}</span>`:''}<div class='worker-slots'>${slots}${placed}${!capacity?`<span class='unlimited' title='Unlimited space'>∞</span>${occupancy.slice(0,6).map(place=>`<span class='work-meeple' style='--player-color:${esc(game.players.find(p=>p.id===place.playerId)?.color||'#9dbb90')}'>${piece(place)}</span>`).join('')}`:''}</div></div><div class='location-plaque'><h3>${esc(space.title)}</h3><span class='action-symbols' aria-hidden='true'>${actionSymbols(space.id)}</span></div><p class='space-description'>${esc(space.description)}</p><div class='space-footer'><span>${suggested?'Suggested next step':actions.length?actions.some(a=>a.worker)?'Place a worker':'Continue action':space.season!==game.phase&&!['any','all','both'].includes(space.season)?words(space.season):'Inspect requirements'}</span>${icon('arrow')}</div></button>`;
}
function tokenList(values, type) {
  return values?.length?values.slice().sort((a,b)=>a-b).map(value=>`<span class='token ${esc(type)}' aria-label='${words(type)} value ${esc(value)}'>${esc(value)}</span>`).join(''):`<span class='empty-rack'>—</span>`;
}
function renderEstate(player, mine=false) {
  if (!player) return '';
  return renderVisualEstate(player,{mine,esc,icon,words}) + (mine?`<button class='secondary full-width' data-act='panel' data-panel='hand'>${icon('card')} Inspect your cards ${icon('arrow')}</button>`:'');
}
function renderHand() {
  const hand=state.game.you?.hand || {vines:[],orders:[],summer:[],winter:[]};
  const kind=state.handTab;
  return `<section class='hand-section'><div class='board-heading'><div><span class='eyebrow'>YOUR PLANS, KEPT CLOSE</span><h2>Your hand</h2><p>Only you can see these cards.</p></div></div><nav class='hand-tabs' aria-label='Card type'>${[['orders','Orders'],['vines','Vines'],['summer','Summer'],['winter','Winter']].map(([id,label])=>`<button class='${kind===id?'is-active':''}' data-act='hand-tab' data-tab='${id}'>${label}<span>${hand[id]?.length||0}</span></button>`).join('')}</nav><div class='cards-list'>${(hand[kind]||[]).map(card=>cardMarkup(card,kind)).join('')||`<div class='empty-state'>${icon(kind==='orders'?'card':kind==='vines'?'leaf':'people')}<h3>A little room for possibility.</h3><p>${kind==='orders'?'Draw an order in winter to give your next vintage a destination.':kind==='vines'?'Draw vines in summer, then plant them in a field.':'Welcome a visitor in autumn, or choose a visitor bonus on the wake-up track.'}</p></div>`}</div></section>`;
}
function cardMarkup(card,kind,full=false) {
  const requirements=card.requirements || [];
  const req=Array.isArray(card.requires)?card.requires:card.requires?[card.requires]:[];
  const artwork={vines:'vine',orders:'order',summer:'summer',winter:'winter'}[kind];
  const portraits={'Nursery courier':'vine','Terrace mason':'build','Water finder':'plant','Roadside host':'tour','Cellar architect':'build','Planting mentor':'plant','Orchard broker':'trade','Field steward':'harvest','Cooperative sponsor':'summer','Estate patron':'tour','Barrel tender':'make','Vintage keeper':'winter','Cellar hand':'harvest','Market scout':'order','Guild recruiter':'train','Wine merchant':'fill','Pruning crew':'plant','Winter host':'winter','Reserve judge':'tour','Estate accountant':'order'};
  const place=portraits[card.name]||artwork;
  let body='';
  if(kind==='vines') body=`<div class='card-yield'>${card.red?`<span class='yield-cluster red'>${icon('grape')}<b>${card.red}</b></span>`:''}${card.white?`<span class='yield-cluster white'>${icon('grape')}<b>${card.white}</b></span>`:''}<small>each harvest</small></div><div class='vine-prerequisites'>${req.length?req.map(id=>`<span>${icon('build')}${words(id)}</span>`).join(''):'<span>Plant in any open field</span>'}</div>${full?'<p class=card-description>Produces grapes every year after planting. Its vines remain in the field after harvest.</p>':''}`;
  else if(kind==='orders') body=`<div class='order-requirements'>${requirements.map(req=>`<div><span class='order-bottle ${esc(req.type)}'>${icon('bottle')}<b>${req.value}+</b></span><span>${words(req.type)}</span></div>`).join('')}</div><div class='order-rewards'><span class='vp-medallion'>${icon('trophy')}<b>${card.points}</b><small>VP</small></span><span class='income-medallion'>${icon('coin')}<b>+${card.income}</b><small>/ year</small></span></div>${full?'<p class=card-description>Use a separate wine for each requirement. Higher wine values also count. Filling an order consumes the wines.</p>':''}`;
  else body=`<p class='card-description'>${esc(card.description)}</p><small class='visitor-season'>${icon(kind==='summer'?'sun':'snow')} ${words(kind)} visitor · one use</small>`;
  const tag=full?'article':'button';
  return `<${tag} class='playing-card ${esc(kind)}-card' ${full?'':`data-act='inspect-card' data-kind='${esc(kind)}' data-id='${esc(card.id)}'`}><span class='card-kicker'>${kind==='vines'?'VINE':kind==='orders'?'WINE ORDER':kind.toUpperCase()+' VISITOR'}</span><div class='card-illustration' data-place='${place}' aria-hidden='true'></div><div class='card-face'><h3>${esc(card.name)}</h3>${body}</div>${!full?`<div class='card-inspect'>Inspect card ${icon('arrow')}</div>`:''}</${tag}>`;
}
function renderJournal() {
  const log=[...state.game.log].reverse();
  return `<section class='journal-section'><div class='board-heading'><div><span class='eyebrow'>THE ESTATE REMEMBERS</span><h2>Vintage journal</h2><p>Every placement, every harvest, every good idea.</p></div></div><ol class='journal-list'>${log.map(entry=>`<li><span class='journal-dot' style='--player-color:${esc(state.game.players.find(p=>p.id===entry.playerId)?.color||'#c7b38b')}'></span><div><small>YEAR ${entry.year} · ${esc(phaseNames[entry.phase]||words(entry.phase))}</small><p>${esc(entry.text)}</p></div></li>`).join('')||'<li>Your first vintage is still unwritten.</li>'}</ol></section>`;
}
function renderFinal() {
  const game=state.game;
  const winners=(game.winnerIds||[]).map(id=>game.players.find(p=>p.id===id)?.name).filter(Boolean);
  const ranked=game.rankings?.length?game.rankings:game.players.slice().sort((a,b)=>b.score-a.score);
  return `<section class='final-card'><div class='final-trophy'>${icon('trophy')}</div><div><span class='eyebrow'>AFTER ${game.year} YEARS IN THE VINEYARD</span><h2>${esc(winners.length?winners.join(' & ')+' wins':'The final vintage is in')}</h2><p>The whole final year has been played. Ties break by coins, wine value, then grape value.</p><div class='final-rankings'>${ranked.map((entry,i)=>{const p=game.players.find(p=>p.id===(entry.id||entry.playerId))||entry;return `<span><b>${i+1}.</b> ${esc(p.name)} <strong>${p.score} VP</strong></span>`;}).join('')}</div></div></section>`;
}

function render() {
  if(state.screen==='home') renderHome();
  else if(state.room?.status==='lobby' || !state.game) renderLobby();
  else renderGame();
  document.body.dataset.season=state.game?.phase||'home';
  document.body.classList.toggle('in-game',state.screen!=='home'&&!!state.game);
  if(state.busy) $$('[data-act=solo],[data-act=host],[data-act=join],[data-act=start]').forEach(node=>node.disabled=true);
}
function closeSheet() {
  state.modal=null;
  const sheet=$('#sheet');
  if(sheet.open) sheet.close();
}
function showSheet(content,modal={type:'info'}) {
  const sheet=$('#sheet');
  const sameDialog=sheet.open&&state.modal?.type===modal.type&&state.modal?.group===modal.group;
  const previousScroll=sheet.scrollTop;
  state.modal=modal;
  $('#sheet-content').innerHTML=content;
  if(!sheet.open) sheet.showModal();
  sheet.scrollTop=sameDialog?previousScroll:0;
  if(!sameDialog)setTimeout(()=>$('#sheet-content button')?.focus({preventScroll:true}),0);
  else $('.choice-option.is-selected',sheet)?.focus({preventScroll:true});
}
function sheetHeader(kicker,title) { return `<div class='sheet-header'><div><span class='eyebrow'>${esc(kicker)}</span><h2>${esc(title)}</h2></div><button class='icon-button' data-act='close-sheet' aria-label='Close dialog'>${icon('close')}</button></div>`; }
function openAction(group,selectedKey=null) {
  if(!state.game) return;
  const options=state.game.legalActions.filter(a=>a.group===group);
  const space=state.game.board.find(s=>s.id===group);
  const selected=options.find(a=>a.key===selectedKey)||options.find(a=>a.worker==='regular')||options[0];
  const model={type:'action',group,key:selected?.key||null,worker:selected?.worker||null,version:state.game.version};
  renderActionSheet(model,space,options);
}
function renderActionSheet(model,space=state.game.board.find(s=>s.id===model.group),options=state.game.legalActions.filter(a=>a.group===model.group)) {
  const selected=options.find(a=>a.key===model.key);
  const types=[...new Set(options.map(a=>a.worker||'choice'))];
  const filtered=types.length>1?options.filter(a=>(a.worker||'choice')===(model.worker||'choice')):options;
  const title=space?.title||({wake:'Choose your wake-up time',visitor:'Welcome a visitor',pass:selected?.label||'Finish this season',discard:'Choose a card to discard'}[model.group])||'Your next choice';
  const blocked=!options.length;
  const reason=!isMyTurn()?`It is ${currentPlayer()?.name || 'another estate'}’s turn. You can inspect this space while you wait.`:space?.reason||'You need the right cards, resources, or structures to use this space. Check your estate and hand for the next step.';
  showSheet(`${sheetHeader(space?.season?words(space.season)+' action':'YOUR NEXT DECISION',title)}<div class='sheet-body'>${space&&placeFor[space.id]?`<div class='action-inspection-art card-illustration' data-place='${placeFor[space.id]}' aria-hidden='true'></div>`:''}<p class='sheet-intro'>${esc(space?.description||selected?.detail||phaseCopy[state.game.phase])}</p>${blocked?`<div class='unavailable-note'>${icon('help')}<div><strong>Not available right now</strong><p>${esc(reason)}</p></div></div>`:''}${space?.bonus&&space.capacity>1?`<div class='bonus-note'><strong>Bonus space</strong> ${esc(space.bonus)}</div>`:''}${types.length>1?`<div class='worker-picker' aria-label='Choose a worker'>${types.map(type=>`<button class='${(model.worker||'choice')===type?'is-active':''}' data-act='choose-worker' data-worker='${type}'>${icon('worker')}${type==='grande'?'Grande worker':type==='regular'?'Regular worker':'Continue action'}</button>`).join('')}</div>`:''}<div class='choice-list'>${filtered.map(action=>`<button class='choice-option ${selected?.key===action.key?'is-selected':''}' data-act='select-action' data-key='${esc(action.key)}' aria-pressed='${selected?.key===action.key}'><span class='choice-radio'>${selected?.key===action.key?icon('check'):''}</span><span><strong>${esc(action.label)}</strong><small>${esc(action.detail)}</small></span></button>`).join('')}</div>${selected?`<div class='preview-summary'><span class='eyebrow'>WHEN YOU CONFIRM</span><p>${esc(selected.detail)}</p>${selected.worker?`<small>${selected.worker==='grande'?'Your grande worker':'One regular worker'} will be used for the rest of this year.${state.game.phase==='summer'?' '+Math.max(0,workerCount(me())-1)+' workers will remain for later.':''}</small>`:''}</div>`:''}</div><div class='sheet-footer'><button class='secondary' data-act='close-sheet'>Keep thinking</button>${selected?`<button class='primary' data-act='commit-action' ${state.busy||!state.online?'disabled':''}>${state.busy?'Placing…':selected.worker==='grande'?'Place grande worker':selected.worker==='regular'?'Place worker':model.group==='discard'?'Discard this card':'Confirm choice'} ${icon('check')}</button>`:`<button class='primary' data-act='close-sheet'>Back to the table</button>`}</div>`,model);
}
function inspectKey(key) { const action=state.game?.legalActions.find(a=>a.key===key); if(action)openAction(action.group,key); }
function settings() {
  showSheet(`${sheetHeader('MAKE IT YOUR TABLE','Table settings')}<div class='sheet-body settings-body'>${guidanceControl()}<div class='setting-row'><div><strong>Night mode</strong><p>A quiet table after sundown.</p></div><button class='toggle ${prefs.theme==='night'?'is-on':''}' data-act='toggle-theme' aria-pressed='${prefs.theme==='night'}'>${prefs.theme==='night'?'On':'Off'}</button></div><label class='field'><span>Control size <b id='scale-value'>${prefs.scale}%</b></span><input type='range' min='100' max='130' step='5' value='${prefs.scale}' data-pref='scale'><small>Larger text and touch targets. Saved on this device.</small></label><div class='setting-row'><div><strong>Vineyard ambience</strong><p>Soft wind, birds, and quiet placement sounds.</p></div><button class='toggle ${prefs.sound?'is-on':''}' data-act='toggle-sound' aria-pressed='${prefs.sound}'>${prefs.sound?'On':'Off'}</button></div><div class='setting-row'><div><strong>Gentle motion</strong><p>Follows your device’s reduced-motion preference.</p></div><button class='toggle ${prefs.motion?'is-on':''}' data-act='toggle-motion' aria-pressed='${prefs.motion}'>${prefs.motion?'On':'Off'}</button></div><div class='setting-row'><div><strong>Contextual coaching</strong><p>Show explanations in Simple and Moderate.</p></div><button class='toggle ${prefs.coaching?'is-on':''}' data-act='toggle-coaching' aria-pressed='${prefs.coaching}'>${prefs.coaching?'On':'Off'}</button></div><p class='form-note'>Guidance is personal. It never changes the rules or your opponents’ choices.</p></div><div class='sheet-footer'><button class='primary' data-act='close-sheet'>Back to the table</button></div>`,{type:'settings'});
}
function help(contextual=false) {
  const g=state.game;
  showSheet(`${sheetHeader('A SEAT AT THE TABLE',contextual&&g?phaseNames[g.phase]+' · your next decision':'How to play')}<div class='sheet-body rules-body'>${contextual&&g?`<section class='rule-feature'><h3>${esc(g.guide?.headline||phaseNames[g.phase])}</h3><p>${esc(g.guide?.body||phaseCopy[g.phase])}</p></section>`:''}<p class='rules-lead'>Build a vineyard that earns the most victory points. Wine orders are your main route: plant vines, harvest grapes, make wine, and trade that wine for points and annual income.</p><div class='rules-seasons'><section><h3>01 · Spring</h3><p>Choose a wake-up position. An early start gives you first choice of spaces. Later rows offer coins, cards, a point, or a worker.</p></section><section><h3>02 · Summer</h3><p>Plant vines, build structures, draw vine cards, welcome visitors, give tours, or trade. <strong>Workers placed now will not be available in winter.</strong></p></section><section><h3>03 · Autumn</h3><p>Draw a summer or winter visitor. A cottage brings an additional visitor.</p></section><section><h3>04 · Winter</h3><p>Harvest a field, make up to two wines, draw or fill an order, train a worker, or play a winter visitor. Training normally helps next year.</p></section></div><details open><summary>Workers & crowded spaces</summary><p>Take turns placing one worker. Two estates share one space per action; three or four share two; five or six share three. Spaces stay occupied for the year. Your grande can still use a full action, but does not take an occupied bonus. Extra workers are valuable, and so is knowing when to pass.</p></details><details><summary>Vines, fields & the harvest</summary><p>A field holds vines whose red and white values add up to its capacity: 5, 6, or 7. Stronger vines need a trellis or irrigation. Harvest each field once per year. Add all its red yields into one red grape, and all white yields into one white grape. The vines stay planted.</p></details><details><summary>Grapes, wines & cellar space</summary><p>One red grape makes a red wine; one white makes a white. Blush combines one red and one white for a value of at least 4. Sparkling combines two red grapes and one white for at least 7. The small, medium, and large cellars store wine up to values 3, 6, and 9. Blush needs a medium cellar; sparkling needs a large cellar.</p><p>You can store one token of each type at each value. New grapes and wines move down to an empty lower value if needed. At year end they age by one wherever capacity and occupied slots permit.</p></details><details><summary>Orders, income & winning</summary><p>Each order needs a separate wine token for every requirement. A wine may exceed the requested value. Filling the order consumes the wines and grants its points and permanent annual income, up to 5 coins per year.</p><p>When someone reaches the target, finish the entire year. Highest score wins; ties break by coins, then total wine value, then grape value. At year end, workers return and hands are reduced to seven cards.</p></details><details><summary>Playing on phone or desktop</summary><p>Tap a board space to inspect it, choose an option, then confirm your placement. Inspecting never spends anything. On a phone, the bottom tabs switch between the board, estate, cards, and journal. On desktop, keys 1–4 switch views; Escape closes a dialog. Settings has control size, day/night, sound, and guidance.</p></details><details><summary>Saves & reconnecting</summary><p>Your seat and an encrypted recovery snapshot are saved in this browser after every update. Reopen the site and choose Return to table. Friends use the room code or shared link. Keep the same browser for your seat; an invitation code does not transfer your identity.</p><p>Use Save recovery backup to download your latest snapshot and seat. Keep that file private: it restores your seat. A live table always keeps its newest server state. After a server reset, recovery begins from the snapshot available on the restoring device.</p></details><button class='text-button' data-act='about'>About this edition ${icon('arrow')}</button></div><div class='sheet-footer'><button class='primary' data-act='close-sheet'>Let’s play</button></div>`,{type:'help'});
}
function about() {
  showSheet(`${sheetHeader('VINEYARD TABLE','Our first vintage')}<div class='sheet-body rules-body'><p class='rules-lead'>An independent DailyFlyer game inspired by the seasonal worker-placement design of <em>Viticulture Essential Edition</em>.</p><p>This version uses original illustrations, original visitor and order cards, and a uniform starting estate. It includes the core seasonal vineyard cycle, regular and grande workers, wake-up choices, buildings, blending, aging, orders, and end-of-year scoring.</p><p>Solo is played against strategic AI estates. It is a different mode from the published game’s Automa. The optional 12-point game is a shorter house variant; the standard target is 20. Expansions and the published Mama/Papa starting cards are not included.</p><p>Viticulture is designed by Jamey Stegmaier and Alan Stone and published by Stonemaier Games. Vineyard Table is not an official digital edition.</p><a class='external-link' href='https://stonemaiergames.com/games/viticulture/' target='_blank' rel='noopener noreferrer'>Explore the original game ${icon('arrow')}</a><p class='form-note'>Built for a few friends around a virtual table. Your guidance can change at any time.</p></div><div class='sheet-footer'><button class='primary' data-act='close-sheet'>Back to the vineyard</button></div>`,{type:'about'});
}

class ApiError extends Error { constructor(message,status,code){super(message);this.status=status;this.code=code;} }
async function api(path,{method='GET',body,token=state.session?.token}={}) {
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),25000);
  try {
    const response=await fetch(path,{method,signal:controller.signal,credentials:'same-origin',cache:'no-store',headers:{...(body!==undefined?{'Content-Type':'application/json'}:{}),...(token?{Authorization:`Bearer ${token}`}:{})},...(body!==undefined?{body:JSON.stringify(body)}:{})});
    let data;
    try{data=await response.json();}catch{throw new ApiError('The table service is waking up. Please try again in a moment.',response.status,'UNAVAILABLE');}
    if(!response.ok)throw new ApiError(data.error||data.message||'The table could not accept that request.',response.status,data.code);
    return data;
  }catch(error){if(error.name==='AbortError')throw new ApiError('The table is taking a moment to respond. Your last saved turn is safe.',0,'NETWORK');throw error;}finally{clearTimeout(timer);}
}
function accept(data,{token,force=false}={}) {
  if(!data?.room)throw new Error('The table returned an incomplete update.');
  state.room=data.room;
  state.game=data.game||null;
  state.session={...(state.session||{}),code:data.room.code,token:token||data.token||state.session?.token,recovery:data.recovery||state.session?.recovery,youId:data.room.youId,name:state.name,updatedAt:Date.now()};
  write(SESSION_KEY,state.session);
  const phase=state.game?.phase;
  if(phase!==state.lastPhase){state.previewSeason=null;state.lastPhase=phase;}
  state.online=true;
  state.retryDelay=1600;
  const signature=JSON.stringify([data.room.version,data.room.status,data.game?.version,data.room.players.map(p=>[p.id,p.connected]),state.online]);
  if(state.modal?.type==='action'&&state.modal.version!==state.game?.version&&!state.busy)closeSheet();
  if(force||signature!==state.lastSignature){state.lastSignature=signature;if(state.screen!=='home')render();}
  updateHeader();
}
async function create(mode,learn=false) {
  if(state.busy)return;
  captureSetup();
  if(learn){prefs.guidance=0;prefs.coaching=true;state.setup.target=12;state.setup.bots=1;applyPreferences();}
  state.busy=true;render();
  try{
    const data=await api('/api/rooms',{method:'POST',token:null,body:{name:state.name,mode,bots:mode==='solo'?state.setup.bots:0,target:state.setup.target}});
    state.session=null;state.screen='table';state.panel='board';state.lastSignature='';accept(data,{token:data.token,force:true});window.scrollTo({top:0,behavior:'instant'});
    if(mode==='solo')toast(learn?'Your first vintage begins. The coach will explain each decision.':'The table is ready. Choose your wake-up time.');
    startPolling();
  }catch(error){toast(error.message,true);}finally{state.busy=false;render();}
}
async function join() {
  if(state.busy)return;
  captureSetup();
  if(!state.joinCode)return toast('Enter the room code your friend shared.');
  state.busy=true;render();
  try{
    if(state.session?.code===state.joinCode){await resume();return;}
    const data=await api(`/api/rooms/${encodeURIComponent(state.joinCode)}/join`,{method:'POST',token:null,body:{name:state.name}});
    state.session=null;state.screen='table';state.panel='board';accept(data,{token:data.token,force:true});window.scrollTo({top:0,behavior:'instant'});startPolling();
    history.replaceState(null,'',location.pathname);
  }catch(error){toast(error.message,true);}finally{state.busy=false;render();}
}
async function refresh({recover=true,force=false}={}) {
  if(!state.session)return;
  try{
    const data=await api(`/api/rooms/${encodeURIComponent(state.session.code)}`);
    accept(data,{force});return data;
  }catch(error){
    if(recover&&error.status===404&&state.session.recovery){
      const data=await api('/api/restore',{method:'POST',body:{recovery:state.session.recovery}});
      accept(data,{force:true});toast('Your saved table has been restored.');return data;
    }
    throw error;
  }
}
async function resume() {
  if(!state.session)return;
  const oldScreen=state.screen;
  state.screen='table';
  try{await refresh({force:true});startPolling();await retryPending();window.scrollTo({top:0,behavior:'instant'});}
  catch(error){state.screen=oldScreen;toast(error.message,true);render();}
}
function startPolling() {clearTimeout(state.pollTimer);state.pollTimer=setTimeout(poll,state.retryDelay);}
async function poll() {
  if(state.screen==='home'||!state.session)return;
  if(state.busy||state.polling){startPolling();return;}
  if(document.hidden){state.pollTimer=setTimeout(poll,5000);return;}
  state.polling=true;
  try{await refresh();if(state.session.pending)await retryPending();}
  catch(error){state.online=false;state.retryDelay=Math.min(15000,state.retryDelay*1.6);updateHeader();}
  finally{state.polling=false;startPolling();}
}
async function startGame() {
  if(state.busy)return;
  const bots=Number($('#lobby-bots')?.value||0);
  state.busy=true;
  try{const data=await api(`/api/rooms/${state.room.code}/start`,{method:'POST',body:{bots}});accept(data,{force:true});window.scrollTo({top:0,behavior:'instant'});}
  catch(error){toast(error.message,true);}finally{state.busy=false;render();}
}
async function commitAction() {
  if(state.busy||state.modal?.type!=='action'||!state.modal.key)return;
  const action=state.game.legalActions.find(a=>a.key===state.modal.key);
  if(!action)return;
  const pending={key:action.key,version:state.game.version,requestId:crypto.randomUUID?crypto.randomUUID():`${Date.now()}-${Math.random().toString(36).slice(2)}`};
  state.session.pending=pending;write(SESSION_KEY,state.session);
  await sendAction(pending,action.label);
}
async function sendAction(pending,label='Your choice') {
  if(state.busy)return;
  state.busy=true;
  const button=$('[data-act=commit-action]');if(button){button.disabled=true;button.textContent='Placing…';}
  try{
    const data=await api(`/api/rooms/${state.session.code}/action`,{method:'POST',body:pending});
    delete state.session.pending;closeSheet();accept(data,{force:true});placementSound();toast(label+' · confirmed');
  }catch(error){
    if(error.status===409){delete state.session.pending;closeSheet();await refresh({force:true});toast('The table moved ahead. Review the current turn before choosing again.');}
    else if(error.status>=400&&error.status<500){delete state.session.pending;toast(error.message,true);await refresh({force:true}).catch(()=>{});}
    else{state.online=false;toast('Connection interrupted. Checking whether your choice reached the table…',true);}
    write(SESSION_KEY,state.session);
  }finally{state.busy=false;if(state.modal?.type==='action')renderActionSheet(state.modal);render();startPolling();}
}
async function retryPending() {if(state.session?.pending&&!state.busy)await sendAction(state.session.pending,'Your pending choice');}
async function rematch() {
  if(state.busy)return;
  state.busy=true;
  try{const data=await api(`/api/rooms/${state.room.code}/rematch`,{method:'POST',body:{}});closeSheet();state.panel='board';accept(data,{force:true});toast('A new vintage begins.');}
  catch(error){toast(error.message,true);}finally{state.busy=false;render();}
}
function inviteUrl() {const url=new URL(location.href);url.search='';url.searchParams.set('room',state.room.code);url.hash='';return url.href;}
async function copyText(value,message) {
  try{await navigator.clipboard.writeText(value);toast(message);}
  catch{showSheet(`${sheetHeader('COPY THIS INVITATION','Bring a friend')}<div class='sheet-body'><label class='field'><span>Invitation</span><input id='copy-value' readonly value='${esc(value)}'></label><p>Press and hold to copy, then share with your friend.</p></div><div class='sheet-footer'><button class='primary' data-act='close-sheet'>Done</button></div>`);$('#copy-value').select();}
}
async function share() {
  if(!state.room)return;
  const url=inviteUrl();
  if(navigator.share){try{await navigator.share({title:'Join my Vineyard Table',text:`Room ${state.room.code} · a vineyard, a few workers, and a good vintage.`,url});return;}catch(error){if(error.name==='AbortError')return;}}
  await copyText(url,'Invitation link copied.');
}
function backup() {
  if(!state.session?.recovery)return toast('Start a table first to save a recovery backup.');
  const payload={format:'vineyard-table-backup',version:1,code:state.session.code,token:state.session.token,recovery:state.session.recovery,name:state.name,savedAt:new Date().toISOString()};
  const blob=new Blob([JSON.stringify(payload,null,2)],{type:'application/json'});
  const url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download=`vineyard-table-${state.session.code.toLowerCase()}.json`;link.click();setTimeout(()=>URL.revokeObjectURL(url),5000);toast('Recovery backup saved. Keep it private; it restores your seat.');
}
function restoreDialog() {
  showSheet(`${sheetHeader('REOPEN A VINTAGE','Restore a backup')}<div class='sheet-body'><p>Choose a Vineyard Table recovery file. It restores the saved table and your seat. A currently live table always keeps its newer state.</p><label class='field'><span>Recovery file</span><input id='restore-file' type='file' accept='.json,application/json'></label><p class='form-note'>Use only your own backup. It contains your private seat credential.</p></div><div class='sheet-footer'><button class='secondary' data-act='close-sheet'>Cancel</button><button class='primary' data-act='restore-file'>Restore table</button></div>`,{type:'restore'});
}
async function restoreFile() {
  const file=$('#restore-file')?.files?.[0];
  if(!file)return toast('Choose a recovery file first.');
  if(file.size>2000000)return toast('That file is too large to be a Vineyard Table backup.',true);
  try{
    const payload=JSON.parse(await file.text());
    if(payload.format!=='vineyard-table-backup'||typeof payload.token!=='string'||typeof payload.recovery!=='string')throw new Error('This is not a Vineyard Table recovery file.');
    const data=await api('/api/restore',{method:'POST',token:payload.token,body:{recovery:payload.recovery}});
    state.session=null;state.name=payload.name||'My Estate';state.screen='table';state.panel='board';closeSheet();accept(data,{token:payload.token,force:true});window.scrollTo({top:0,behavior:'instant'});startPolling();toast('Your vineyard is back at the table.');
  }catch(error){toast(error.message,true);}
}

let audioContext=null,ambientGain=null,ambientSource=null,birdTimer=null;
function ensureAudio() {
  if(!prefs.sound)return;
  try{const Constructor=window.AudioContext||window.webkitAudioContext;if(!Constructor)return;if(!audioContext)audioContext=new Constructor();audioContext.resume().catch(()=>{});syncAmbient();}catch{/* Sound is optional. */}
}
function syncAmbient() {
  if(!audioContext)return;
  if(!prefs.sound||document.hidden){if(ambientGain)ambientGain.gain.setTargetAtTime(0,audioContext.currentTime,0.2);clearTimeout(birdTimer);return;}
  if(!ambientSource){
    const buffer=audioContext.createBuffer(1,audioContext.sampleRate*3,audioContext.sampleRate),data=buffer.getChannelData(0);let previous=0;
    for(let i=0;i<data.length;i++){previous=(previous+(Math.random()*2-1)*0.015)/1.015;data[i]=previous;}
    ambientSource=audioContext.createBufferSource();ambientSource.buffer=buffer;ambientSource.loop=true;
    const filter=audioContext.createBiquadFilter();filter.type='lowpass';filter.frequency.value=650;
    ambientGain=audioContext.createGain();ambientGain.gain.value=0;ambientSource.connect(filter).connect(ambientGain).connect(audioContext.destination);ambientSource.start();
  }
  ambientGain.gain.setTargetAtTime(0.12,audioContext.currentTime,1);
  clearTimeout(birdTimer);birdTimer=setTimeout(birdsong,10000+Math.random()*14000);
}
function tone(frequency,at,duration,gain,type='sine') {
  const o=audioContext.createOscillator(),g=audioContext.createGain();o.type=type;o.frequency.setValueAtTime(frequency,at);g.gain.setValueAtTime(0,at);g.gain.linearRampToValueAtTime(gain,at+0.015);g.gain.exponentialRampToValueAtTime(0.0001,at+duration);o.connect(g).connect(audioContext.destination);o.start(at);o.stop(at+duration+0.05);
}
function birdsong(){if(!audioContext||!prefs.sound||document.hidden)return;const t=audioContext.currentTime;tone(1800,t,0.12,0.012);tone(2400,t+0.13,0.1,0.009);syncAmbient();}
function placementSound(){if(!prefs.sound)return;ensureAudio();if(audioContext){tone(280,audioContext.currentTime,0.14,0.035,'triangle');tone(420,audioContext.currentTime+0.04,0.18,0.02,'triangle');}}

document.addEventListener('click',async event=>{
  const button=event.target.closest('[data-act]');if(!button||button.disabled)return;
  const action=button.dataset.act;ensureAudio();
  if(action==='solo')return create('solo');
  if(action==='learn')return create('solo',true);
  if(action==='host')return create('online');
  if(action==='join')return join();
  if(action==='resume')return resume();
  if(action==='start')return startGame();
  if(action==='close-sheet')return closeSheet();
  if(action==='about')return about();
  if(action==='help')return help();
  if(action==='settings')return settings();
  if(action==='explain')return help(true);
  if(action==='share')return share();
  if(action==='copy-code')return copyText(state.room.code,'Room code copied.');
  if(action==='backup')return backup();
  if(action==='restore-dialog')return restoreDialog();
  if(action==='restore-file')return restoreFile();
  if(action==='panel'){state.panel=button.dataset.panel;state.previewSeason=null;renderGame();window.scrollTo({top:0,behavior:'instant'});return;}
  if(action==='hand-shortcut'){state.handTab=button.dataset.tab;state.panel='hand';renderGame();window.scrollTo({top:0,behavior:'instant'});return;}
  if(action==='hand-tab'){state.handTab=button.dataset.tab;renderGame();return;}
  if(action==='preview-season'){state.previewSeason=button.dataset.season;renderGame();return;}
  if(action==='action-group')return openAction(button.dataset.group);
  if(action==='inspect-key')return inspectKey(button.dataset.key);
  if(action==='select-action'){state.modal.key=button.dataset.key;return renderActionSheet(state.modal);}
  if(action==='choose-worker'){const worker=button.dataset.worker==='choice'?null:button.dataset.worker;state.modal.worker=worker;state.modal.key=state.game.legalActions.find(a=>a.group===state.modal.group&&(a.worker||null)===worker)?.key;return renderActionSheet(state.modal);}
  if(action==='commit-action')return commitAction();
  if(action==='inspect-player'){const p=state.game.players.find(p=>p.id===button.dataset.id);return showSheet(`${sheetHeader('AROUND THE TABLE',p.name)}<div class='sheet-body estate-inspection'>${renderEstate(p)}</div><div class='sheet-footer'><button class='primary' data-act='close-sheet'>Back to the table</button></div>`);}
  if(action==='inspect-card'){const kind=button.dataset.kind,card=state.game.you.hand[kind].find(c=>String(c.id)===button.dataset.id);if(!card)return;const group={vines:'plant',orders:'fill_order',summer:'summer_visitor',winter:'winter_visitor'}[kind];return showSheet(`${sheetHeader(words(kind),card.name)}<div class='sheet-body card-inspection'>${cardMarkup(card,kind,true)}</div><div class='sheet-footer'><button class='secondary' data-act='close-sheet'>Close</button><button class='primary' data-act='action-group' data-group='${group}'>Inspect ${kind==='vines'?'planting':kind==='orders'?'order filling':'visitor action'} ${icon('arrow')}</button></div>`);}
  if(action==='hide-coaching'){prefs.coaching=false;applyPreferences();render();toast('Coaching hidden. You’re still in '+guidanceNames[prefs.guidance]+'; restore it in Settings.');return;}
  if(action==='toggle-theme')prefs.theme=prefs.theme==='night'?'day':'night';
  if(action==='toggle-sound'){prefs.sound=!prefs.sound;ensureAudio();}
  if(action==='toggle-motion')prefs.motion=!prefs.motion;
  if(action==='toggle-coaching')prefs.coaching=!prefs.coaching;
  if(action.startsWith('toggle-')){applyPreferences();render();settings();return;}
  if(action==='rematch-confirm')return showSheet(`${sheetHeader('ANOTHER VINTAGE','Set the table again?')}<div class='sheet-body'><p>This starts a fresh game with everyone’s current seat. The completed game’s journal will be replaced.</p><button class='text-button' data-act='backup'>Save this vintage first</button></div><div class='sheet-footer'><button class='secondary' data-act='close-sheet'>Keep this table</button><button class='primary' data-act='rematch'>Start a new vintage</button></div>`);
  if(action==='rematch')return rematch();
});
document.addEventListener('input',event=>{
  const key=event.target.dataset.pref;if(!key)return;
  if(key==='guidance'){prefs.guidance=Number(event.target.value);event.target.setAttribute('aria-valuetext',guidanceNames[prefs.guidance]);$$('.guidance-value').forEach(node=>node.textContent=guidanceNames[prefs.guidance]);$$('.guidance-description').forEach(node=>node.textContent=guidanceText[prefs.guidance]);}
  if(key==='scale'){prefs.scale=Number(event.target.value);if($('#scale-value'))$('#scale-value').textContent=prefs.scale+'%';}
  applyPreferences();
});
document.addEventListener('change',event=>{
  if(event.target.dataset.pref){if(state.screen==='home')captureSetup();render();}
  if(event.target.id==='bot-count'||event.target.id==='point-target'||event.target.id==='player-name')captureSetup();
});
document.addEventListener('keydown',event=>{
  if(['INPUT','TEXTAREA','SELECT'].includes(event.target.tagName)||$('#sheet').open)return;
  if(state.screen==='table'&&state.game&&['1','2','3','4'].includes(event.key)){state.panel=['board','estate','hand','log'][Number(event.key)-1];renderGame();}
});
$('#sheet').addEventListener('cancel',()=>{state.modal=null;});
$('#sheet').addEventListener('click',event=>{if(event.target===$('#sheet')){const r=event.target.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)closeSheet();}});
$('#home-button')?.addEventListener('click',()=>{closeSheet();state.screen='home';clearTimeout(state.pollTimer);render();window.scrollTo({top:0,behavior:'instant'});});
$('#settings-button')?.addEventListener('click',settings);
$('#help-button')?.addEventListener('click',()=>help());
document.addEventListener('visibilitychange',()=>{syncAmbient();if(!document.hidden&&state.screen==='table')startPolling();});
window.addEventListener('online',()=>{if(state.screen==='table')startPolling();});
window.addEventListener('offline',()=>{state.online=false;updateHeader();toast('You’re offline. Your last snapshot is saved; the table will reconnect.');});
applyPreferences();
render();
