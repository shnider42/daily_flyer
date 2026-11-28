import {TEAMS, getTeam, OFFENSE, DEFENSE} from './teams.js';
import {Match} from './engine.js';
import {CourtView} from './view.js';
import {Controls} from './input.js';
import {HoopsAudio} from './audio.js';
import {LocalStore, createCup, advanceCup, cupMatch, validCup, roundName} from './season.js';
import {FixedClock} from './vendor/math.js';
import {bindGameButton} from './vendor/pgi-controls.js';

const $ = id => document.getElementById(id);
const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const clockText = seconds => { const s = Math.max(0, Math.ceil(seconds)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2,'0')}`; };
const lastName = name => name.split(' ').at(-1);
let browserStorage; try { browserStorage = localStorage; } catch { browserStorage = null; }
const store = new LocalStore(browserStorage);
const saved = store.read('settings', {});
const settings = {home: 'boston-college', away: 'duke', difficulty: 'varsity', guidance: 'simple', halfSeconds: 180, camera: 'full', controlSize: 1, leftHanded: false, showNames: true, sound: false, ...((saved && typeof saved === 'object') ? saved : {})};
if (!TEAMS.some(t => t.id === settings.home)) settings.home = 'boston-college';
if (!TEAMS.some(t => t.id === settings.away) || settings.home === settings.away) settings.away = settings.home === 'duke' ? 'uconn' : 'duke';
if (!['freshman','varsity','all-american'].includes(settings.difficulty)) settings.difficulty = 'varsity';
if (!['simple','moderate','expert'].includes(settings.guidance)) settings.guidance = 'simple';
if (![90,180,360,1200].includes(Number(settings.halfSeconds))) settings.halfSeconds = 180;
if (!['full','follow'].includes(settings.camera)) settings.camera = 'full';
settings.controlSize = Math.max(.8, Math.min(1.25, Number(settings.controlSize) || 1));
let cup = store.read('cup', null); if (!validCup(cup)) cup = null;
let mode = 'quick', game = null, previewGame, paused = false, replay = null, lastReplay = null;
let history = [], replayAccumulator = 0, matchFinished = false, lastPhase = '', lastControlContext = '', messageUntil = 0, lastEventId = 0;
let lastStamp = performance.now(), uiAccumulator = 0, matchMode = 'quick', pendingCupResult = false;
const dialogStack = [];
const audio = new HoopsAudio(), view = new CourtView($('court')), previewView = new CourtView($('preview'));
audio.setEnabled(!!settings.sound);

function persist() {
  if (!store.write('settings', settings)) saveWarning();
}
function saveWarning() {
  $('saveNotice').hidden = false;
  $('saveNotice').textContent = 'Browser storage is unavailable. You can still play, but settings and cup progress may not survive a reload.';
}
function saveCup() { if (!store.write('cup', cup)) saveWarning(); }
function theme(team, away) {
  document.documentElement.style.setProperty('--home', team.primary);
  document.documentElement.style.setProperty('--away', away.primary);
}
function mobileBook() { return matchMedia('(max-width:760px), (max-width:1000px) and (max-height:560px)').matches; }
function anyDialog() { return !!document.querySelector('dialog[open]'); }
function isActive() { return !!game && !paused && !replay && !document.hidden && game.phase !== 'finished' && game.phase !== 'halftime'; }
function syncPause() {
  const value = anyDialog() || (mobileBook() && $('playbook').classList.contains('open'));
  if (value !== paused) { paused = value; controls.clear(); fixed.reset(); paused ? audio.pause() : audio.resume(); }
}
function showDialog(dialog) {
  controls.clear(); audio.pause(); paused = true;
  if (!dialog.open) { dialogStack.push(dialog); dialog.showModal(); }
}
function closeDialog(dialog) { if (dialog.open) dialog.close(); syncPause(); }
function applySettings() {
  document.documentElement.style.setProperty('--control-scale', settings.controlSize);
  document.body.classList.toggle('left-handed', settings.leftHanded);
  $('guidance').value = settings.guidance; $('pauseGuidance').value = settings.guidance;
  $('cameraSetting').value = settings.camera; $('controlSize').value = settings.controlSize;
  $('leftHanded').checked = !!settings.leftHanded; $('namesSetting').checked = !!settings.showNames;
  $('soundSetting').checked = !!settings.sound; $('soundToggle').setAttribute('aria-pressed', String(!!settings.sound));
  $('soundToggle').textContent = settings.sound ? 'Sound on' : 'Sound off';
  $('viewToggle').textContent = settings.camera === 'full' ? 'Follow play' : 'Full court';
}
function toggleSound(value = !settings.sound) {
  settings.sound = !!value; audio.setEnabled(settings.sound);
  if (settings.sound && game && !paused) audio.resume();
  applySettings(); persist();
}
function resetPreview() {
  previewGame = new Match({home:getTeam(settings.home),away:getTeam(settings.away),human:-1,practice:true,seed:77,difficulty:'varsity'});
  $('previewHome').textContent = previewGame.teams[0].short; $('previewAway').textContent = previewGame.teams[1].short;
}
function refreshSetup() {
  const team = getTeam(settings.home), away = getTeam(settings.away);
  theme(team, away);
  $('teamIdentity').style.borderLeftColor = team.primary === '#000e2f' ? '#acc9dc' : team.primary;
  $('teamIdentity').innerHTML = `<strong>${escape(team.name)} ${escape(team.mascot)}</strong><span>${escape(team.description)}</span><div class="identity-ratings"><b>SHOT ${team.ratings.shooting}</b><b>PACE ${team.ratings.speed}</b><b>DEF ${team.ratings.defense}</b><b>GLASS ${team.ratings.rebounding}</b></div>`;
  $('homeTeam').value = settings.home; $('awayTeam').value = settings.away;
  $('difficulty').value = settings.difficulty; $('gameLength').value = settings.halfSeconds;
  $('opponentLabel').hidden = mode === 'cup'; document.querySelector('.versus').hidden = mode === 'cup';
  document.querySelector('.matchup').style.gridTemplateColumns = mode === 'cup' ? '1fr' : '';
  $('gameLength').closest('label').hidden = mode === 'practice';
  $('modeDescription').textContent = mode === 'cup' ? 'Eight programs. Three wins. One champion. Your completed rounds save between games.' : mode === 'practice' ? 'A full 5-on-5 scrimmage with no game-clock limit. Learn the meter and your playbook.' : 'Your five against the CPU. Pick a matchup and take the floor.';
  $('startGame').textContent = mode === 'cup' ? 'Start a new Campus Cup' : mode === 'practice' ? 'Start a scrimmage' : 'Take the floor';
  $('startGame').disabled = false;
  $('resumeCup').hidden = !cup || cup.completed;
  if (cup && !cup.completed) $('resumeCup').textContent = `Continue cup · ${getTeam(cup.teamId).short} · ${roundName(cup.round)}`;
  $('showBracket').hidden = !cup;
  document.querySelectorAll('[data-mode]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.mode === mode)));
}
function drawPlay(id) {
  const routes = {pickroll:'M60 64 L67 43 L83 25 M85 36 L65 43 L67 17',motion:'M20 45 Q60 2 100 45 M100 60 Q60 30 20 60',spacing:'M60 64 L60 35 L19 44 M60 35 L101 44',post:'M60 65 L88 28 L72 16 M20 35 L15 61'};
  return `<svg viewBox="0 0 120 76" aria-hidden="true"><path d="M8 70V6H112V70 M45 6V32H75V6 M8 24Q60 91 112 24" fill="none" stroke="#60757d" stroke-width="1.5"/><circle cx="60" cy="15" r="4" fill="none" stroke="#b9c8cc"/><path d="${routes[id]}" fill="none" stroke="#ffb46b" stroke-width="2" stroke-dasharray="4 2"/><g fill="#b7dfc2"><circle cx="60" cy="64" r="4"/><circle cx="20" cy="45" r="3"/><circle cx="100" cy="45" r="3"/><circle cx="88" cy="28" r="3"/><circle cx="34" cy="20" r="3"/></g></svg>`;
}
function buildPlaybook() {
  $('offensePlays').innerHTML = OFFENSE.map((p, i) => `<button class="play-card" data-play="${p.id}" aria-pressed="false" title="${escape(p.description)}"><kbd>${i+1}</kbd>${drawPlay(p.id)}<b>${escape(p.name)}</b><small>${escape(p.tag)}</small></button>`).join('');
  $('defensePlays').innerHTML = DEFENSE.map(p => `<button data-defense="${p.id}" aria-pressed="false" title="${escape(p.description)}">${escape(p.id === 'man' ? 'Man' : p.id === 'zone' ? '2–3 zone' : 'Press')}</button>`).join('');
  document.querySelectorAll('[data-play]').forEach(b => b.addEventListener('click', () => selectPlay(b.dataset.play)));
  document.querySelectorAll('[data-defense]').forEach(b => b.addEventListener('click', () => { if (!game) return; game.setDefense(b.dataset.defense); $('commentary').textContent = DEFENSE.find(d=>d.id===b.dataset.defense).hint; closePlaybook(); updateUI(); }));
}
function selectPlay(id) {
  if (!game) return; game.setPlay(id); $('commentary').textContent = OFFENSE.find(p=>p.id===id).hint;
  closePlaybook(); updateUI();
}
function closePlaybook() { $('playbook').classList.remove('open'); syncPause(); }
function openPlaybook() { $('playbook').classList.add('open'); syncPause(); }

const controls = new Controls({stick:$('joystick'),knob:$('stickKnob'),shoot:$('shootButton'),pass:$('passButton'),sprint:$('sprintButton'),steal:$('stealButton'),switcher:$('switchButton'),screen:$('screenButton'),active:isActive,
  onPause:togglePause,
  onAction(name, payload = {}) {
    if (!isActive()) return;
    if (name === 'play') { selectPlay(OFFENSE[payload.index]?.id); return; }
    if (name === 'shoot' && !game.inOffense()) name = 'block';
    if (name === 'pass' && !game.inOffense()) name = 'switch';
    if (name === 'pass') payload.aim = view.screenDirection(controls.read());
    if (name === 'timeout') { callTimeout(); return; }
    const succeeded = game.action(name, payload);
    if (succeeded && (name === 'shoot' || name === 'pass' || name === 'switch')) controls.cancelShot();
    if (name === 'shoot' && !succeeded && game.phase === 'freeThrow' && game.phaseTime > 0) announce('Set at the line. Take your shot.', 1.5);
    consumeEvents();
  }
});
const fixed = new FixedClock(dt => {
  if (!isActive()) return;
  game.step(dt, view.screenDirection(controls.read()));
  const context = `${game.possession}/${game.controlled}/${game.phase === 'freeThrow'}`;
  if (context !== lastControlContext) { controls.cancelShot(); lastControlContext = context; }
  replayAccumulator += dt;
  if (replayAccumulator >= .1) { replayAccumulator = 0; history.push(game.snapshot()); if (history.length > 65) history.shift(); }
  consumeEvents();
});
function startMatch({resume = false, next = false} = {}) {
  for (const d of document.querySelectorAll('dialog[open]')) d.close();
  let home = getTeam(settings.home), away = getTeam(settings.away), halfSeconds = Number(settings.halfSeconds), difficulty = settings.difficulty;
  matchMode = mode;
  if (resume || next) { mode = matchMode = 'cup'; }
  if (matchMode === 'cup') {
    if (!resume && !next) {
      if (cup && !cup.completed && !window.confirm('Start a new Campus Cup? Your saved bracket will be replaced.')) return;
      cup = createCup(settings.home, {halfSeconds, difficulty}); saveCup();
    }
    const m = cupMatch(cup); if (!m) { refreshSetup(); return; }
    home = getTeam(cup.teamId); away = getTeam(m.home === cup.teamId ? m.away : m.home);
    halfSeconds = cup.halfSeconds; difficulty = cup.difficulty;
  }
  game = new Match({home,away,halfSeconds,difficulty,practice:matchMode === 'practice',human:0,seed:Date.now() >>> 0});
  paused = false; replay = null; lastReplay = null; history = []; replayAccumulator = 0; matchFinished = false; pendingCupResult = false; lastEventId = 0; lastPhase = ''; lastControlContext = ''; targetKey = '';
  $('lobby').hidden = true; $('game').hidden = false; document.body.classList.add('playing');
  $('playbook').classList.remove('open'); $('replayBanner').hidden = true; $('showReplay').disabled = true;
  $('courtMessage').textContent = ''; messageUntil = 0; $('commentary').textContent = `${home.short} against ${away.short}. Call your first play.`;
  controls.clear(); fixed.reset(); theme(home, away); audio.resume(); lastStamp = performance.now();
  updateUI(); consumeEvents(); $('court').focus({preventScroll:true});
}
function leaveGame() {
  controls.clear(); audio.pause(); game = null; replay = null; lastReplay = null; history = [];
  for (const d of document.querySelectorAll('dialog[open]')) d.close();
  $('game').hidden = true; $('lobby').hidden = false; document.body.classList.remove('playing'); paused = false;
  $('playbook').classList.remove('open'); refreshSetup(); resetPreview(); $('startGame').focus({preventScroll:true});
}
function announce(text, duration = 1.6) { $('courtMessage').textContent = text; messageUntil = performance.now() + duration * 1000; }
function consumeEvents() {
  if (!game) return;
  for (const event of game.drainEvents()) {
    audio.event(event); lastEventId = event.id;
    if (event.text) $('commentary').textContent = event.text;
    if (['score','foul','turnover','steal','block','overtime','freeThrow','timeout'].includes(event.type)) {
      const teamName = event.team !== undefined ? game.teams[event.team].short : '';
      announce(event.type === 'score' ? `${teamName} +${event.points} · ${event.text}` : event.text, event.type === 'foul' ? 2.3 : 1.5);
    }
    if (event.type === 'score' && event.points > 1) {
      lastReplay = history.slice(-55).concat([game.snapshot()]);
      $('showReplay').disabled = lastReplay.length < 4;
    }
  }
  if (game.phase === 'halftime' && lastPhase !== 'halftime') showBreak(false);
  if (game.phase === 'finished' && !matchFinished) { matchFinished = true; finishMatch(); showBreak(true); }
  lastPhase = game.phase;
}
function finishMatch() {
  if (matchMode === 'cup' && !pendingCupResult) {
    pendingCupResult = true;
    try { cup = advanceCup(cup, {homeId:game.teams[0].id,awayId:game.teams[1].id,score:game.score}); saveCup(); }
    catch { announce('The game finished, but the bracket could not be updated.', 4); }
  }
  const results = store.read('results', []);
  store.write('results', [{home:game.teams[0].id,away:game.teams[1].id,score:[...game.score],mode:matchMode,date:new Date().toISOString()},...(Array.isArray(results)?results:[])].slice(0,12));
}
function showBreak(final) {
  controls.clear();
  const won = game.score[0] > game.score[1], leader = game.players.filter(p=>p.team===0).sort((a,b)=>b.stats.points-a.stats.points)[0];
  $('breakEyebrow').textContent = final ? matchMode === 'cup' ? 'CAMPUS CUP · FINAL WHISTLE' : 'FINAL WHISTLE' : 'THE HALFTIME HUDDLE';
  $('breakTitle').textContent = final ? cup?.champion === game.teams[0].id && matchMode === 'cup' ? 'Cut down the nets.' : won ? 'That one belongs to you.' : 'A tough night. Run it back.' : 'A new half. A fresh start.';
  $('breakScore').innerHTML = `<span>${escape(game.teams[0].short)}</span><strong>${game.score[0]} : ${game.score[1]}</strong><span>${escape(game.teams[1].short)}</span>`;
  $('breakSummary').textContent = final ? matchMode === 'cup' && cup && !cup.completed ? `You're through to the ${roundName(cup.round).toLowerCase()}. Your progress is saved.` : matchMode === 'cup' && cup?.champion ? `${game.teams[0].name} wins the Campus Cup. Three games. One champion.` : `${leader.name} led your team with ${leader.stats.points} points. ${won ? 'Good ball movement makes a difference.' : 'Find the open shot and keep the next possession simple.'}` : `Your leading scorer: ${leader.name}, ${leader.stats.points} points. Both teams switch ends for the second half.`;
  $('breakStats').innerHTML = `<div class="summary-stats"><div>FIELD GOALS<strong>${game.stats[0].fgm}/${game.stats[0].fga}</strong></div><div>REBOUNDS<strong>${game.stats[0].rebounds} : ${game.stats[1].rebounds}</strong></div><div>TURNOVERS<strong>${game.stats[0].turnovers} : ${game.stats[1].turnovers}</strong></div></div>`;
  $('continueGame').textContent = final ? matchMode === 'cup' && cup && !cup.completed ? `Play the ${roundName(cup.round).toLowerCase()}` : 'Play again' : 'Start the second half';
  $('backToLobby').hidden = !final;
  showDialog($('breakDialog'));
}
function togglePause() {
  const top = dialogStack.at(-1);
  if (top) { if (top.id !== 'breakDialog') closeDialog(top); return; }
  if (!game) return;
  if (anyDialog()) return;
  if (replay) { stopReplay(); return; }
  if ($('playbook').classList.contains('open')) { closePlaybook(); return; }
  if (game.phase === 'finished' || game.phase === 'halftime') return;
  renderSubs(); applySettings(); showDialog($('pauseDialog'));
}
function callTimeout() {
  if (!game) return;
  if (!game.action('timeout')) announce(game.timeouts[0] <= 0 ? 'No timeouts remaining.' : 'Call timeout while your team controls the ball.', 2);
  consumeEvents(); updateUI();
}
function renderSubs() {
  const list = game.players.filter(p=>p.team===0);
  const option = p => `<option value="${p.id}">${escape(p.name)} · ${p.position} · ${Math.round(p.stamina*100)}% · ${p.fouls}F</option>`;
  $('subOut').innerHTML = list.filter(p=>p.active).map(option).join('');
  $('subIn').innerHTML = list.filter(p=>!p.active&&p.fouls<5).map(option).join('');
  $('makeSub').disabled = !list.some(p=>!p.active&&p.fouls<5);
  $('subStatus').textContent = game.pendingSubs.length ? `${game.pendingSubs.length} substitution queued.` : '';
}
function roster() {
  const team = getTeam(settings.home); $('rosterTitle').textContent = `${team.name} ${team.mascot}`;
  $('rosterTable').innerHTML = `<table><thead><tr><th>PLAYER</th><th>POS</th><th>SHOT</th><th>INSIDE</th><th>DEF</th><th>REB</th></tr></thead><tbody>${team.players.map((p,i)=>`<tr><td>#${p.number} ${escape(p.name)}<small>${i<5?'Starting five':'Bench'} · ${Math.floor(p.height/12)}′${p.height%12}″</small></td><td>${p.position}</td><td>${p.ratings.shooting}</td><td>${p.ratings.inside}</td><td>${p.ratings.defense}</td><td>${p.ratings.rebound}</td></tr>`).join('')}</tbody></table>`;
  showDialog($('rosterDialog'));
}
function boxScore() {
  if (!game) return;
  $('statsTitle').textContent = `${game.teams[0].short} ${game.score[0]} — ${game.score[1]} ${game.teams[1].short}`;
  $('statsContent').innerHTML = game.teams.map((team,side)=>`<div class="stat-team"><h3>${escape(team.name)}</h3><span>${game.stats[side].fgm}/${game.stats[side].fga} FG · ${game.stats[side].threesMade}/${game.stats[side].threesAttempted} 3PT</span></div><div class="table-wrap"><table><thead><tr><th>PLAYER</th><th>PTS</th><th>REB</th><th>AST</th><th>STL</th><th>BLK</th><th>F</th></tr></thead><tbody>${game.players.filter(p=>p.team===side).map(p=>`<tr><td>${escape(p.name)}<small>${p.position}${p.active?' · On court':''}${p.fouls>=5?' · Fouled out':''}</small></td>${['points','rebounds','assists','steals','blocks'].map(k=>`<td>${p.stats[k]}</td>`).join('')}<td>${p.fouls}</td></tr>`).join('')}</tbody></table></div>`).join('');
  showDialog($('statsDialog'));
}
function showBracket() {
  if (!cup) return;
  $('bracketContent').innerHTML = `<p>${escape(getTeam(cup.teamId).name)}${cup.champion ? ' · Campus champions' : cup.eliminated ? ' · Eliminated' : ` · Next: ${roundName(cup.round)}`}</p>${cup.rounds.map(r=>`<section class="bracket-round"><h3>${r.name}</h3>${r.matches.map(m=>`<div class="bracket-match${m.home===cup.teamId||m.away===cup.teamId?' player-match':''}"><span>${escape(getTeam(m.home).short)}${m.score?` <b>${m.score[0]}</b>`:''}</span><span>${m.winner ? m.simulated?'SIMULATED':'FINAL' : 'VS'}</span><span>${m.score?`<b>${m.score[1]}</b> `:''}${escape(getTeam(m.away).short)}</span></div>`).join('')}</section>`).join('')}<p class="small-note">Other matchups are simulated. Your completed rounds are saved in this browser.</p>`;
  showDialog($('bracketDialog'));
}
function startReplay() {
  if (!lastReplay?.length || !game) return;
  controls.clear(); replay = {frames:lastReplay,time:0}; audio.pause(); $('replayBanner').hidden = false; closePlaybook();
}
function stopReplay() { replay = null; $('replayBanner').hidden = true; fixed.reset(); if (!paused) audio.resume(); updateUI(); }

let targetKey = '';
function updateTargets() {
  if (!game) return;
  const offense = game.inOffense();
  const receivers = offense ? game.receivers().slice(0,4) : [];
  const key = receivers.map(p=>p.id).join(',')+`/${offense}`;
  if (key !== targetKey) {
    targetKey = key;
    $('passTargets').innerHTML = offense ? receivers.map((p,i)=>`<button data-receiver="${p.id}" aria-label="Pass to ${escape(p.name)}"><b>${'ABCD'[i]}</b>${escape(lastName(p.name))}</button>`).join('') : '<span class="defense-instruction">STAY BETWEEN YOUR MAN AND THE RIM</span>';
    $('passTargets').querySelectorAll('[data-receiver]').forEach(b => bindGameButton(b,()=>{if(!isActive())return;controls.cancelShot();game.action('pass',{targetId:Number(b.dataset.receiver)});consumeEvents();}));
  }
  $('shootButton').innerHTML = offense ? `SHOOT<small>${game.phase==='freeThrow'?'FREE THROW':'HOLD SPACE'}</small>` : 'BLOCK<small>SPACE</small>';
  $('passButton').innerHTML = offense ? 'PASS<small>J</small>' : 'SWITCH<small>J / Q</small>';
  $('screenButton').style.visibility = offense ? 'visible' : 'hidden';
  $('stealButton').style.visibility = offense ? 'hidden' : 'visible';
  $('switchButton').style.visibility = offense ? 'hidden' : 'visible';
}
function updateUI() {
  if (!game) return;
  $('homeAbbr').textContent = game.teams[0].short; $('awayAbbr').textContent = game.teams[1].short;
  $('homeScore').textContent = game.score[0]; $('awayScore').textContent = game.score[1];
  $('period').textContent = game.practice ? 'SCRIMMAGE' : game.period<=2 ? `${game.period===1?'1ST':'2ND'} HALF` : `OVERTIME ${game.period-2}`;
  $('clock').textContent = game.practice ? '∞' : clockText(game.clock);
  $('shotClock').textContent = game.phase==='freeThrow' ? '—' : Math.max(0,Math.ceil(game.shotClock));
  $('shotClock').parentElement.classList.toggle('urgent',game.shotClock<6);
  const bonus = n => n>=10?' · 2 SHOTS':n>=7?' · 1+1':'';
  $('homeFouls').textContent = `${game.teamFouls[0]} FOULS${bonus(game.teamFouls[0])}`;
  $('awayFouls').textContent = `${game.teamFouls[1]} FOULS${bonus(game.teamFouls[1])}`;
  const dir = game.attackDir(0), world = view.screenDirection({x:1,y:0});
  const toward = Math.abs(world.y)>.5 ? (dir*world.y>0?'RIGHT':'LEFT') : (dir<0?'UP':'DOWN');
  $('possession').textContent = game.inOffense() ? `ATTACK ${toward}` : 'ON DEFENSE';
  $('situation').textContent = replay ? 'INSTANT REPLAY' : game.phase==='freeThrow' ? `${game.freeThrows?.team===0?'YOUR':'OPPONENT'} FREE THROW` : game.phase==='inbound' ? `${game.teams[game.possession].short} INBOUND` : game.ball.flight?.kind==='shot' ? 'SHOT IN THE AIR' : game.ball.owner===null ? 'LOOSE BALL' : game.inOffense() ? 'YOUR POSSESSION' : 'GET A STOP';
  const play = OFFENSE.find(p=>p.id===game.offense[0]) || OFFENSE[0];
  $('playName').textContent = play.name.toUpperCase(); $('playHint').textContent = play.hint;
  document.querySelectorAll('[data-play]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.play===game.offense[0])));
  document.querySelectorAll('[data-defense]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.defense===game.defense[0])));
  const p = game.controlledPlayer();
  if (p) {
    $('playerPosition').textContent = `${p.position} · #${p.number} · ${p.fouls} PERSONAL FOULS`;
    $('playerName').textContent = p.name; $('playerTag').textContent = `YOU · #${p.number} ${lastName(p.name)}`;
    $('staminaFill').style.width = `${Math.round(p.stamina*100)}%`; $('staminaLabel').textContent = `${Math.round(p.stamina*100)}%`;
    $('playerStats').textContent = `${p.stats.points} PTS · ${p.stats.rebounds} REB · ${p.stats.assists} AST`;
  }
  $('callTimeout').innerHTML = `Timeout (${game.timeouts[0]}) <kbd>T</kbd>`;
  let coach = '';
  if (settings.guidance!=='expert') {
    if (game.phase==='freeThrow') coach=game.freeThrows?.team===0?'At the line: hold SHOOT, then release in green.':'Get ready to rebound a missed final free throw.';
    else if (!game.inOffense()) coach='Q / SWITCH selects a defender. E / STEAL reaches; Space / BLOCK contests.';
    else if (game.shotClock<7) coach='Shot clock is low. Get a shot up before the horn.';
    else if (settings.guidance==='simple') coach='Hold SHOOT and release in green. J / PASS or tap a teammate to move the ball.';
    else coach=play.hint;
  }
  $('coachLine').textContent = coach || `${game.teams[0].arena} · ${matchMode==='cup'?roundName(cup?.round||0):'Pocket College Hoops'}`;
  updateTargets();
}

// Setup and settings use regular clicks so keyboard and assistive input stay native.
for (const id of ['homeTeam','awayTeam']) $(id).innerHTML = TEAMS.map(t=>`<option value="${t.id}">${escape(t.name)}</option>`).join('');
$('homeTeam').addEventListener('change',()=>{settings.home=$('homeTeam').value;if(settings.home===settings.away)settings.away=TEAMS.find(t=>t.id!==settings.home).id;persist();refreshSetup();resetPreview();});
$('awayTeam').addEventListener('change',()=>{settings.away=$('awayTeam').value;if(settings.home===settings.away)settings.home=TEAMS.find(t=>t.id!==settings.away).id;persist();refreshSetup();resetPreview();});
$('difficulty').addEventListener('change',()=>{settings.difficulty=$('difficulty').value;persist();});
$('gameLength').addEventListener('change',()=>{settings.halfSeconds=Number($('gameLength').value);persist();});
for(const id of ['guidance','pauseGuidance']) $(id).addEventListener('change',()=>{settings.guidance=$(id).value;applySettings();persist();updateUI();});
$('cameraSetting').addEventListener('change',()=>{settings.camera=$('cameraSetting').value;applySettings();persist();});
$('viewToggle').addEventListener('click',()=>{settings.camera=settings.camera==='full'?'follow':'full';applySettings();persist();});
$('controlSize').addEventListener('input',()=>{settings.controlSize=Number($('controlSize').value);applySettings();persist();});
$('leftHanded').addEventListener('change',()=>{settings.leftHanded=$('leftHanded').checked;applySettings();persist();});
$('namesSetting').addEventListener('change',()=>{settings.showNames=$('namesSetting').checked;persist();});
$('soundToggle').addEventListener('click',()=>toggleSound()); $('soundSetting').addEventListener('change',()=>toggleSound($('soundSetting').checked));
document.querySelectorAll('[data-mode]').forEach(b=>b.addEventListener('click',()=>{mode=b.dataset.mode;refreshSetup();}));
$('startGame').addEventListener('click',()=>startMatch()); $('resumeCup').addEventListener('click',()=>startMatch({resume:true}));
$('showRoster').addEventListener('click',roster); $('showBracket').addEventListener('click',showBracket);
for(const id of ['showHelp','gameHelp','pauseHelp']) $(id).addEventListener('click',()=>showDialog($('helpDialog')));
for(const id of ['showBoxScore','pauseStats','breakBoxScore']) $(id).addEventListener('click',boxScore);
$('pauseGame').addEventListener('click',togglePause); $('resumeGame').addEventListener('click',()=>closeDialog($('pauseDialog')));
$('quitGame').addEventListener('click',()=>{if(window.confirm('Leave this game? Completed tournament rounds stay saved.'))leaveGame();});
$('backToLobby').addEventListener('click',leaveGame);
$('continueGame').addEventListener('click',()=>{if(!game)return;if(game.phase==='halftime'){game.action('continue');closeDialog($('breakDialog'));lastPhase=game.phase;lastControlContext='';updateUI();}else if(matchMode==='cup'&&cup&&!cup.completed){startMatch({next:true});}else{if(matchMode==='cup')mode='quick';startMatch();}});
$('breakDialog').addEventListener('cancel',e=>e.preventDefault());
$('openPlays').addEventListener('click',openPlaybook); $('closePlays').addEventListener('click',closePlaybook);
$('callTimeout').addEventListener('click',callTimeout); $('showReplay').addEventListener('click',startReplay); $('skipReplay').addEventListener('click',stopReplay);
$('makeSub').addEventListener('click',()=>{const ok=game.action('substitute',{outId:Number($('subOut').value),inId:Number($('subIn').value)});renderSubs();$('subStatus').textContent=ok?'Substitution requested. It takes effect at the next dead ball.':'That substitution is unavailable.';});
document.querySelectorAll('[data-close]').forEach(b=>b.addEventListener('click',()=>closeDialog(b.closest('dialog'))));
document.querySelectorAll('dialog').forEach(d=>d.addEventListener('close',()=>{const index=dialogStack.indexOf(d);if(index>=0)dialogStack.splice(index,1);syncPause();}));
$('fullscreen').addEventListener('click',async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else await $('game').requestFullscreen();}catch{announce('Full screen is unavailable in this browser.',2);}});
let pointerStart = null;
$('court').addEventListener('pointerdown',e=>{pointerStart={x:e.clientX,y:e.clientY,id:e.pointerId};});
$('court').addEventListener('pointerup',e=>{if(!pointerStart||pointerStart.id!==e.pointerId||Math.hypot(e.clientX-pointerStart.x,e.clientY-pointerStart.y)>12||!isActive())return;pointerStart=null;const id=view.hitPlayer(e.clientX,e.clientY,game);const p=game.player(id);if(!p||p.team!==0)return;controls.cancelShot();game.action(game.inOffense()?'pass':'switch',game.inOffense()?{targetId:id}:{id});consumeEvents();});
$('court').addEventListener('pointercancel',()=>{pointerStart=null;});
document.addEventListener('visibilitychange',()=>{if(document.hidden&&game&&!anyDialog()&&!replay&&game.phase!=='finished'&&game.phase!=='halftime')togglePause();lastStamp=performance.now();fixed.reset();});
window.addEventListener('blur',()=>{if(game&&!anyDialog()&&!replay&&game.phase!=='finished'&&game.phase!=='halftime')togglePause();});
window.addEventListener('resize',()=>{if(!mobileBook())$('playbook').classList.remove('open');syncPause();});

function frame(stamp) {
  const dt = Math.min(.06,Math.max(0,(stamp-lastStamp)/1000)); lastStamp=stamp;
  if (!document.hidden) {
    if (game) {
      if (replay) {
        replay.time+=dt*.5; const index=Math.floor(replay.time/.1);
        if(index>=replay.frames.length)stopReplay();else view.render(replay.frames[index],{dt,time:stamp/1000,guidance:'expert',camera:settings.camera,showNames:settings.showNames});
      } else {
        fixed.advance(dt);
        view.render(game,{dt,time:stamp/1000,charge:controls.charge,charging:controls.charging&&game.inOffense(),guidance:settings.guidance,camera:settings.camera,showNames:settings.showNames});
        if(!paused)audio.update(dt,game);
      }
      uiAccumulator+=dt;if(uiAccumulator>.1){uiAccumulator=0;updateUI();}
      $('shotMeter').hidden=!controls.charging||!game.inOffense()||paused;
      if(controls.charging){$('shotFill').style.width=`${controls.charge*100}%`;$('shotNeedle').style.left=`${Math.min(98,controls.charge*100)}%`;}
      const feedback=game.shotFeedback;
      $('releaseFeedback').hidden=!feedback||feedback.team!==0||feedback.expires<game.elapsed||replay!==null;
      if(feedback&&!$('releaseFeedback').hidden)$('releaseFeedback').textContent=`${feedback.text}${feedback.contest!==undefined?feedback.contest>.55?' · CONTESTED':feedback.contest<.2?' · OPEN':'':''}`;
      if(stamp>messageUntil)$('courtMessage').textContent='';
    } else if(previewGame) {
      previewGame.step(dt,{});previewGame.drainEvents();
      previewView.render(previewGame,{dt,time:stamp/1000,preview:true,guidance:'expert',camera:'full',showNames:false});
      $('previewScore').textContent=`${previewGame.score[0]} : ${previewGame.score[1]}`;
    }
  }
  requestAnimationFrame(frame);
}

buildPlaybook();applySettings();refreshSetup();resetPreview();if(!store.available||!browserStorage)saveWarning();requestAnimationFrame(frame);
