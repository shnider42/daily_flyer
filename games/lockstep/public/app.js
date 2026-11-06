import * as W from './world.mjs';
import { SceneArt } from './art.js';
import { CoopClient } from './network.js';

const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const SAVE = 'lockstep.solo.v1', SETTINGS = 'lockstep.settings.v1';
let state = W.newGame(), room = 'cell', mode = 'solo', playing = false;
let elapsed = 0, lastFrame = 0, lastClock = Date.now(), roster = [], networkStatus = '';
let modal = null, restoreFocus = null, toastTimer, pendingAction = null;
let codeInput = '', switchInput = [], pipeInput = [], labels = false, completionShown = -1;
let settings = { brighter: false, reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches };
let saved = null;
try { Object.assign(settings, JSON.parse(localStorage.getItem(SETTINGS) || '{}')); } catch {}
try { const s = JSON.parse(localStorage.getItem(SAVE)); if (s && W.isValidState(s.state)) saved = s; } catch {}
const menuArt = new SceneArt($('#menu-canvas'));
const gameArt = new SceneArt($('#game-canvas'));
const client = new CoopClient({
  onState(next, meta) {
    const previousLevel = state.level;
    const continuingTeam = mode === 'coop' && playing;
    state = next;
    if (meta.initial) {
      mode = 'coop'; playing = true; elapsed = Math.max(0, (client.serverNow - state.startedAt) / 1000);
      if (!continuingTeam || state.level !== previousLevel) {
        completionShown = -1; room = W.LEVELS[state.level].startRoom;
        if (!continuingTeam) pendingAction = null;
        closeDialog();
      }
      if (!W.availableRooms(state).some(r => r.id === room)) room = W.LEVELS[state.level].startRoom;
      showGame(false);
      if (!W.isLevelComplete(state)) {
        if (!continuingTeam || modal?.kind === 'crew') showCrew();
        else if (modal?.kind === 'object') renderObject(modal.id, true);
        else if (modal?.kind === 'hints') showHints();
        else if (modal?.kind === 'notes') showNotes();
      }
    } else {
      if (state.level !== previousLevel) { room = W.LEVELS[state.level].startRoom; completionShown = -1; closeDialog(); }
      refresh();
      if (meta.actorId !== client.playerId && meta.event && !['inspect','hint'].includes(meta.event)) {
        const who = roster.find(p => p.id === meta.actorId)?.name || 'A teammate';
        toast(`${who}: ${meta.message || 'progress updated'}`);
      }
      if (modal?.kind === 'hints') showHints();
      if (modal?.kind === 'object' && W.isDone(state, modal.id)) renderObject(modal.id, true);
      checkCompletion();
    }
  },
  onStatus(status, detail) {
    networkStatus = status;
    const elem = $('#network-status');
    elem.textContent = status === 'connected' ? `TEAM ${client.roomCode}` : detail || status.toUpperCase();
    elem.dataset.offline = String(status !== 'connected');
    if (['connecting','reconnecting'].includes(status)) {
      const feedback = $('#dialog-feedback'); if (feedback) feedback.textContent = detail;
    }
    if (status === 'error') {
      pendingAction = null;
      const feedback = $('#dialog-feedback'); if (feedback) feedback.textContent = detail;
      toast(detail);
      if (modal?.kind === 'coop') $$('#dialog button[data-connect]').forEach(b => b.disabled = false);
    }
    if (status === 'disconnected' && playing && mode === 'coop') toast(detail);
  },
  onRoster(players) { roster = players; $('#crew-count').textContent = `${players.filter(p => p.connected).length}/4`; if (modal?.kind === 'crew') showCrew(); },
  onMessage(packet) {
    if (packet.type === 'action-result') {
      const action = pendingAction; pendingAction = null;
      if (packet.ok) finishAction(action, packet);
      else feedback(packet.message);
    } else if (packet.message) feedback(packet.message);
  }
});

function persist() {
  if (mode !== 'solo' || !playing) return;
  // Another tab may have started a new escape or advanced this run. Preserve
  // that newer save, and point Continue at it instead of writing stale progress.
  try {
    const latest = JSON.parse(localStorage.getItem(SAVE) || 'null');
    if (latest && W.isValidState(latest.state) && (
      latest.state.startedAt > state.startedAt ||
      (latest.state.startedAt === state.startedAt && latest.state.revision > state.revision)
    )) {
      saved = latest;
      return;
    }
  } catch {}
  saved = { state, room, elapsed };
  try { localStorage.setItem(SAVE, JSON.stringify(saved)); } catch {}
}
function persistSettings() { try { localStorage.setItem(SETTINGS, JSON.stringify(settings)); } catch {} applySettings(); }
function applySettings() { document.body.classList.toggle('brightness-boost', settings.brighter); }
function timeText(seconds) { const n = Math.max(0, Math.floor(seconds)); return `${String(Math.floor(n / 60)).padStart(2,'0')}:${String(n % 60).padStart(2,'0')}`; }
function toast(text, duration = 3600) { const t = $('#toast'); t.textContent = text; t.classList.add('show'); clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), duration); }
function feedback(text) { if ($('#dialog-feedback')) $('#dialog-feedback').textContent = text; else toast(text); $$('#dialog button[data-action]').forEach(b => b.disabled = false); }
function modalOpen(html, context) {
  const wasOpen = !$('#overlay').hidden;
  const focused = document.activeElement;
  const sameContext = modal?.kind === context?.kind && modal?.id === context?.id;
  let focusSelector = null;
  if (wasOpen && sameContext && $('#dialog').contains(focused)) {
    if (focused.dataset.switch !== undefined) focusSelector = `[data-switch="${focused.dataset.switch}"]`;
    else if (focused.dataset.pipe !== undefined) focusSelector = `[data-pipe="${focused.dataset.pipe}"]`;
    else if (focused.id && focused.id !== 'dialog') focusSelector = '#' + focused.id;
  }
  if (!wasOpen) restoreFocus = document.activeElement;
  modal = context;
  $('#dialog-body').innerHTML = html;
  $('#overlay').hidden = false;
  $('#close-dialog').hidden = !!context?.unclosable;
  $('#dialog').classList.toggle('chapter-complete', context?.kind === 'complete');
  if (!wasOpen || !sameContext) $('#dialog').scrollTop = 0;
  const replacement = focusSelector ? $('#dialog').querySelector(focusSelector) : null;
  (replacement || $('#dialog')).focus({ preventScroll: true });
}
function closeDialog() {
  // Dismissing a join attempt must also cancel its socket; a delayed welcome
  // must never replace a solo escape started from the title screen.
  if (modal?.kind === 'coop' && !client.connected && ['connecting','reconnecting'].includes(networkStatus)) {
    client.leave(); pendingAction = null;
  }
  $('#overlay').hidden = true; modal = null;
  // An in-flight team action belongs to the connection, not the dialog.
  // Keep it until its acknowledgement so another action cannot steal its result.
  if (restoreFocus?.isConnected) restoreFocus.focus({ preventScroll: true });
}
const dialogHead = (eyebrow, title, text = '') => `<div class="eyebrow">${esc(eyebrow)}</div><h2 id="dialog-title">${esc(title)}</h2>${text ? `<p>${esc(text)}</p>` : ''}`;
const actionButton = (label, attrs = '') => `<button class="primary" data-action ${attrs}>${esc(label)} <span aria-hidden="true">→</span></button>`;
const feedbackSlot = '<div id="dialog-feedback" class="dialog-feedback" role="status" aria-live="polite"></div>';

function refreshMenu() {
  $('#continue-btn').hidden = !saved || saved.state.won;
  $('#start-btn').textContent = saved && !saved.state.won ? 'START A NEW ESCAPE ↗' : 'ENTER THE CELL ↗';
}
function startSolo(resume = false) {
  if (mode === 'coop' || client.connected || ['connecting','reconnecting'].includes(networkStatus)) client.leave();
  mode = 'solo'; pendingAction = null;
  state = resume && saved ? saved.state : W.newGame();
  elapsed = resume && saved ? saved.elapsed || 0 : 0;
  room = resume && saved && W.availableRooms(state).some(r => r.id === saved.room) ? saved.room : W.LEVELS[state.level].startRoom;
  completionShown = -1; closeDialog(); showGame(!resume); persist();
}
function showGame(intro = true) {
  playing = true; lastClock = Date.now();
  $('#menu').hidden = true; $('#game').hidden = false;
  $('#network-status').hidden = mode !== 'coop'; $('#crew-btn').hidden = mode !== 'coop';
  refresh();
  if (intro) toast('The count is over. Tap objects to investigate your cell.', 5000);
  checkCompletion();
}
function goMenu() { persist(); playing = false; closeDialog(); $('#game').hidden = true; $('#menu').hidden = false; refreshMenu(); }
function setRoom(id) {
  if (!W.availableRooms(state).some(r => r.id === id)) {
    const destination = W.LEVELS[state.level].rooms.find(r => r.id === id);
    toast(`${destination?.title || 'That room'} is still locked. Look for a way through from this room.`); return;
  }
  room = id; closeDialog(); gameArt.setRoom(room); refresh(); persist();
  if (mode === 'coop') client.presence(room);
}
function refresh() {
  const level = W.LEVELS[state.level];
  if (!W.availableRooms(state).some(r => r.id === room)) room = level.startRoom;
  gameArt.setRoom(room);
  const current = level.rooms.find(r => r.id === room);
  $('#chapter-label').textContent = `ACT ${level.number} / ${level.shortTitle.toUpperCase()}`;
  $('#room-title').textContent = current.title;
  $('#scene-coordinate').textContent = `BWP // ${current.number}`;
  $('#objective').textContent = W.objective(state);
  $('#hints-left').textContent = W.getHints(state).remaining;
  $('#hint-btn').setAttribute('aria-label', `Open hints, ${W.getHints(state).remaining} of 3 remaining this level`);
  $('#rooms').innerHTML = level.rooms.map((r,i) => {
    const open = W.availableRooms(state).some(a => a.id === r.id);
    return `<button class="room-btn" data-room="${r.id}" aria-current="${r.id === room}" data-locked="${!open}" aria-label="${esc(r.title)}${!open ? ', locked' : ''}"><span class="room-num">0${i+1}</span><span class="room-name">${esc(r.title)}</span><span class="room-state" aria-hidden="true">${r.id === room ? '●' : open ? '↗' : '⌑'}</span></button>`;
  }).join('');
  $$('#rooms button').forEach(button => button.onclick = () => setRoom(button.dataset.room));
  const items = state.inventory.filter(id => W.ITEMS[id]?.level === state.level);
  $('#item-count').textContent = String(items.length).padStart(2,'0');
  $('#inventory').innerHTML = items.length ? items.map(id => `<button class="item-btn" data-item="${id}" aria-label="Inspect ${esc(W.ITEMS[id].title)}" title="${esc(W.ITEMS[id].title)}">${itemSvg(id)}<span class="item-tag">${esc(W.ITEMS[id].symbol)}</span></button>`).join('') : '<span class="empty-inventory">Nothing yet. Look for what they left behind.</span>';
  $$('#inventory button').forEach(button => button.onclick = () => showItem(button.dataset.item));
  const notes = state.inspected.filter(id => W.ALL_OBJECTS[id]?.clue);
  $('#note-count').textContent = notes.length;
  $('#hotspots').innerHTML = W.getObjects(state, room).map(o => `<button class="hotspot" data-object="${o.id}" data-done="${W.isDone(state,o)}" aria-label="Inspect ${esc(o.title)}"><span class="hotspot-mark" aria-hidden="true"></span><span class="hotspot-label">${esc(o.title)}</span></button>`).join('');
  $$('#hotspots button').forEach(button => button.onclick = () => openObject(button.dataset.object));
  $('#hotspots').classList.toggle('show-labels', labels);
  $('#inspect-btn').setAttribute('aria-pressed', String(labels));
  $('#scan-indicator').hidden = room !== 'evidence' || state.inventory.includes('evidenceKey');
  if (mode === 'coop') client.presence(room);
}
function dispatch(action) {
  if (mode === 'coop') {
    if (pendingAction) { feedback('Waiting for that action to reach your team…'); return; }
    pendingAction = action;
    if (!client.sendAction(action)) pendingAction = null;
    return;
  }
  const result = W.reduce(state, action, { now: Date.now() });
  if (!result.ok) { feedback(result.message); return; }
  state = result.state; persist(); refresh(); finishAction(action,result);
}
function finishAction(action, result) {
  if (!action) { checkCompletion(); return; }
  if (action.type === 'hint') { showHints(); return; }
  if (action.type === 'advance') {
    room = W.LEVELS[state.level].startRoom; completionShown = -1;
    closeDialog(); refresh(); persist(); toast(W.LEVELS[state.level].intro, 5500); return;
  }
  if (W.isLevelComplete(state)) { checkCompletion(); return; }
  const object = W.ALL_OBJECTS[action.id];
  if (!object) return;
  if (object.opens && W.availableRooms(state).some(r => r.id === object.opens) && !object.puzzle) { setRoom(object.opens); toast(result.message); return; }
  if (modal?.kind === 'object' && modal.id === action.id) renderObject(action.id, true);
  if (result.event && !['inspect','puzzle'].includes(result.event)) toast(result.message);
}
function openObject(id) {
  const object = W.inspect(state, id);
  if (!object) return;
  codeInput = ''; switchInput = [...(object.puzzle?.initial || [])]; pipeInput = [...(object.puzzle?.initial || [])];
  renderObject(id);
  if (['clue','flavor','decoyExit'].includes(object.kind)) dispatch({type:'interact',id});
}
function itemSvg(id) {
  const item = W.ITEMS[id] || {symbol:'?',color:'#a7b7b5'};
  const color = esc(item.color);
  if (id.toLowerCase().includes('card')) return `<svg viewBox="0 0 90 90" aria-hidden="true"><g transform="rotate(-13 45 45)"><rect x="17" y="20" width="56" height="44" rx="4" fill="${color}"/><path d="M17 31h56" stroke="#20343c" stroke-width="9"/><rect x="24" y="44" width="11" height="13" fill="#293b42"/><path d="M41 47h24M41 52h17" stroke="#33484c" stroke-width="2"/>${item.decoy?'<path d="M25 24l40 34M65 24L25 58" stroke="#b8664b" stroke-width="4"/>':''}</g></svg>`;
  return `<svg viewBox="0 0 90 90" aria-hidden="true"><g transform="rotate(-34 45 45)" fill="none" stroke="${color}" stroke-width="6" stroke-linecap="square"><path d="M45 39v34h11v-9h-11m0-10h8"/>${item.symbol === '△' ? '<path d="M45 12L61 39H29Z"/>' : item.symbol === '□' ? '<rect x="32" y="14" width="26" height="25" rx="2"/>' : item.symbol === '◇' ? '<path d="M45 9L61 25L45 41L29 25Z"/>' : '<circle cx="45" cy="25" r="14"/>'}</g></svg>`;
}
function lockSvg(symbol, open = false) { return `<svg width="100" height="108" viewBox="0 0 100 108" aria-hidden="true"><path d="${open?'M30 49V29a20 20 0 0 1 40 0':'M30 49V29a20 20 0 0 1 40 0v20'}" fill="none" stroke="#a1b5b5" stroke-width="7"/><rect x="18" y="44" width="64" height="54" rx="4" fill="${open?'#6c9a86':'#9b875e'}" stroke="#263b42" stroke-width="2"/><text x="50" y="79" text-anchor="middle" fill="#182e35" font-size="30" font-family="sans-serif">${esc(open?'✓':symbol||'●')}</text></svg>`; }
function tallies(count) {
  let lines=''; for(let i=0;i<count;i++){ const group=Math.floor(i/5), part=i%5, x=10+group*51+part*10; lines += part===4 ? `<path d="M${10+group*51-4} 33l40-24"/>` : `<path d="M${x} 8l-2 29"/>`; }
  return `<svg viewBox="0 0 ${count>5?95:58} 45" style="width:100%;max-width:90px;height:42px" aria-label="${count} tally marks"><g fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">${lines}</g></svg>`;
}
function clueVisual(clue) {
  if (!clue) return '';
  if (clue.type === 'tallies') return `<div class="inspection-visual"><div class="clue-paper"><h3>SCRATCHED INTO THE CONCRETE</h3><div class="symbol-row">${clue.entries.map(entry=>`<div class="symbol-cell"><div class="symbol-large">${esc(entry.symbol)}</div>${tallies(entry.count)}</div>`).join('')}</div><p class="small-note">${esc(clue.caption)}</p></div></div>`;
  if (clue.type === 'notice') return `<div class="inspection-visual"><div class="clue-paper"><h3>${esc(clue.heading)}</h3><p>${esc(clue.text)}</p><div class="visual-stamp" style="display:inline-block;color:#6c4c34;border-color:#6c4c3477">${esc(clue.stamp)}</div></div></div>`;
  if (clue.type === 'circuits') return `<div class="inspection-visual"><div class="clue-paper"><h3>ISOLATION / SERVICE DRAWING</h3>${clue.entries.map(e=>`<div class="trace-row"><span class="symbol-large">${esc(e.symbol)}</span><span class="trace-line ${e.on?'':'broken'}"></span><span>${esc(e.label)}</span><span>${e.on?'◉':'⊗'}</span></div>`).join('')}<p class="small-note">${esc(clue.caption)}</p></div></div>`;
  if (clue.type === 'routes') return `<div class="inspection-visual"><div class="clue-paper"><h3>BLACKWELL / EVACUATION PLAN</h3><svg viewBox="0 0 300 130" role="img" aria-label="The triangle route loops back to Intake; the wave route crosses the outer wall to the open coast" style="width:100%;height:auto"><path d="M35 20h145v92H35Z" fill="none" stroke="#63706a" stroke-width="2" stroke-dasharray="5 3"/><rect x="59" y="40" width="63" height="45" fill="#b0b39b" stroke="#4e5d58"/><text x="90" y="65" text-anchor="middle" font-size="10" fill="#334642">INTAKE</text><path d="M145 98V23H90v17" fill="none" stroke="#8c593d" stroke-width="3"/><path d="M84 33l6 8 6-8" fill="none" stroke="#8c593d" stroke-width="2"/><text x="148" y="19" font-size="19" fill="#8c593d">△</text><path d="M145 98h105V65" fill="none" stroke="#3d6866" stroke-width="3"/><path d="M244 73l6-8 6 8" fill="none" stroke="#3d6866" stroke-width="2"/><text x="239" y="50" font-size="26" fill="#3d6866">≈</text><text x="200" y="121" font-size="9" fill="#3d6866">OPEN COAST</text></svg><p class="small-note">${esc(clue.caption)}</p></div></div>`;
  if (clue.type === 'scan') return `<div class="inspection-visual scan-closeup"><svg viewBox="0 0 280 90" style="width:100%;height:90px" role="img" aria-label="Camera sweep has a lit watch interval and a dark blind spot"><rect x="18" y="21" width="38" height="23" rx="3" fill="#9dafaa"/><path d="M56 26l20-9v28L56 37Z" fill="#667f7d"/><path d="M79 15L260 3V68L79 47Z" fill="#dfac5025" stroke="#dfac5066"/><path d="M45 45v25H25" fill="none" stroke="#8ca39e" stroke-width="4"/></svg><div class="scan-indicator" style="position:relative;left:auto;top:auto;transform:none;margin-top:12px" data-scan><span class="scan-dot"></span><span data-scan-label>CAMERA WATCHING</span></div></div><p class="puzzle-note">${esc(clue.caption)}</p>`;
  return '';
}
function renderObject(id, preserveInput = false) {
  const object = W.inspect(state, id); if (!object) { closeDialog(); return; }
  const done = W.isDone(state,object), current = W.LEVELS[state.level].rooms.find(r=>r.id===object.room);
  let visual='', controls='', description=done ? object.success || object.description : object.description;
  if (object.clue) visual = clueVisual(object.clue);
  else if (object.item && (done || object.kind === 'pickup')) {
    visual = `<div class="inspection-visual"><div class="item-art">${done ? itemSvg(object.item) : propSilhouette(object.prop)}</div><span class="visual-caption">${esc(done ? W.ITEMS[object.item].title.toUpperCase() : 'LOOK A LITTLE CLOSER')}</span></div>`;
  } else if (['unlock','unlockPickup','exit','passage'].includes(object.kind)) visual=`<div class="inspection-visual">${lockSvg(object.symbol,done)}<span class="visual-caption">${esc(done?'UNLOCKED':object.keys?.length===2?'TWO KEYS · ONE GATE':'MATCH THE MARK')}</span></div>`;
  else if (object.kind === 'flavor') visual=`<div class="inspection-visual">${propSilhouette(object.prop)}<div class="visual-caption">NOT EVERYTHING IS A WAY OUT</div></div>`;
  if (object.kind==='puzzle' && !done) {
    if (object.puzzle.type==='code') {
      visual=`<div class="inspection-visual" style="padding:18px"><div class="lock-order">${object.puzzle.symbols.map(esc).join(' ')}</div><div id="code-display" class="code-display" aria-label="Combination entered" aria-live="polite">${esc(codeInput.padEnd(object.puzzle.length,'–'))}</div><div class="visual-caption">${esc(object.puzzle.prompt)}</div></div>`;
      controls=`<div class="keypad" aria-label="Combination keypad">${[1,2,3,4,5,6,7,8,9,'CLR',0,'ENTER'].map(n=>`<button data-digit="${n}" class="${typeof n==='string'?'key-action':''}" aria-label="${n==='CLR'?'Clear combination':n==='ENTER'?'Try combination':n}">${n}</button>`).join('')}</div>`;
    } else if (object.puzzle.type==='switches') {
      controls=`<div class="toggle-grid">${object.puzzle.symbols.map((s,i)=>`<button class="toggle-control" data-switch="${i}" data-on="${switchInput[i]}" aria-label="${esc(object.puzzle.labels[i])}: ${switchInput[i]?'on':'off'}" aria-pressed="${switchInput[i]}"><span class="symbol-large">${esc(s)}</span><span class="switch"><i></i></span><span>${switchInput[i]?'ON':'OFF'}</span></button>`).join('')}</div><p class="puzzle-note">${esc(object.puzzle.prompt)}</p>${actionButton('APPLY CIRCUITS','id="solve-btn"')}`;
    } else if (object.puzzle.type==='pipes') {
      const evaluation = W.evaluateCircuit(pipeInput);
      controls=`<div class="pipe-legend"><span>↑ NORTH</span><span>TAP TO ROTATE ↻</span></div><div class="pipe-grid">${object.puzzle.tiles.map((kind,i)=>pipeTile(kind,pipeInput[i],i,evaluation.energized.includes(i))).join('')}</div><div class="pipe-legend"><span>IN → MIDDLE LEFT</span><span>MIDDLE RIGHT → OUT</span></div><p class="puzzle-note">${esc(object.puzzle.prompt)}</p>${actionButton('ENERGISE THE GATE','id="solve-btn"')}`;
    }
  } else if (object.kind==='timed' && !done) {
    visual=clueVisual({type:'scan',caption:'The amber light means watched. Wait for the green BLIND SPOT indicator, then reach.'});
    controls=actionButton('REACH FOR THE KEY','id="interact-btn" data-timed="true"');
  } else if (done) {
    if (object.puzzle && !visual) visual=`<div class="inspection-visual">${lockSvg('',true)}<span class="visual-caption">${esc(object.item?'ITEM COLLECTED':'SYSTEM READY')}</span></div>`;
    if (object.opens) controls=actionButton('CONTINUE TO '+W.LEVELS[state.level].rooms.find(r=>r.id===object.opens)?.title.toUpperCase(),'id="move-btn"');
    else controls='<button class="secondary" id="done-btn">BACK TO THE ROOM</button>';
  } else if (['pickup','unlockPickup','unlock','exit','passage'].includes(object.kind)) {
    const label = object.kind==='pickup'?'SEARCH HERE':object.kind==='unlockPickup'?'TRY THE MAINTENANCE KEY':object.kind==='exit'?'OPEN THE GATE':object.kind==='passage'?'PASS THROUGH':object.key&&W.hasItem(state,object.key)?'USE '+W.ITEMS[object.key].short.toUpperCase():'EXAMINE THE LOCK';
    controls=actionButton(label,'id="interact-btn"');
  } else controls='<button class="secondary" id="done-btn">BACK TO THE ROOM</button>';
  modalOpen(dialogHead(`${current.title.toUpperCase()} / INSPECTION`,object.title,description)+visual+controls+feedbackSlot,{kind:'object',id});
  if ($('#interact-btn')) $('#interact-btn').onclick=()=>dispatch({type:'interact',id});
  if ($('#solve-btn')) $('#solve-btn').onclick=()=>dispatch({type:'solve',id,value:object.puzzle.type==='switches'?[...switchInput]:[...pipeInput]});
  if ($('#move-btn')) $('#move-btn').onclick=()=>setRoom(object.opens);
  if ($('#done-btn')) $('#done-btn').onclick=closeDialog;
  $$('#dialog [data-digit]').forEach(button=>button.onclick=()=>{
    const digit=button.dataset.digit;
    if(digit==='CLR') codeInput='';
    else if(digit==='ENTER'){dispatch({type:'solve',id,value:codeInput});return;}
    else if(codeInput.length<object.puzzle.length) codeInput+=digit;
    else codeInput=digit;
    $('#code-display').textContent=codeInput.padEnd(object.puzzle.length,'–');
    $('#dialog-feedback').textContent='';
  });
  $$('#dialog [data-switch]').forEach(button=>button.onclick=()=>{const i=Number(button.dataset.switch);switchInput[i]=!switchInput[i];renderObject(id,true);});
  $$('#dialog [data-pipe]').forEach(button=>button.onclick=()=>{const i=Number(button.dataset.pipe);pipeInput[i]=(pipeInput[i]+1)%4;renderObject(id,true);});
  updateScanner();
}
function propSilhouette(prop) {
  if (prop==='bed') return '<svg viewBox="0 0 140 80" width="140" height="80" aria-hidden="true"><path d="M15 65V24m110 41V24M15 49h110M15 55h110" stroke="#839e9c" stroke-width="4"/><rect x="18" y="30" width="104" height="20" rx="4" fill="#416a76"/><rect x="22" y="29" width="25" height="13" rx="4" fill="#b6bca9"/><path d="M56 31l50 4 12-7" fill="none" stroke="#8aaba6" stroke-width="2"/></svg>';
  if (prop==='grate') return '<svg viewBox="0 0 100 100" width="90" height="90" aria-hidden="true"><rect x="14" y="14" width="72" height="72" rx="4" fill="#112731" stroke="#719291" stroke-width="3"/><path d="M25 20v60m13-60v60m13-60v60m13-60v60m13-60v60" stroke="#688b8f" stroke-width="4"/></svg>';
  return '<svg viewBox="0 0 110 90" width="110" height="90" aria-hidden="true"><path d="M14 22l43-13 40 15-42 15Z" fill="#69766d"/><path d="M14 22v46l41 15V39Z" fill="#4d6669"/><path d="M97 24v44L55 83V39Z" fill="#344f59"/><path d="M29 48l11 4m29-1 13-5" stroke="#b4b9a1" stroke-width="3"/></svg>';
}
function pipeTile(kind,rotation,index,energized) {
  const ports=W.pipePorts(kind,rotation), endpoint=[[45,0],[90,45],[45,90],[0,45]];
  const color=energized?'#b6d1a7':'#7e9aa0';
  const paths=ports.map(d=>`<path d="M45 45L${endpoint[d][0]} ${endpoint[d][1]}"/>`).join('');
  return `<button class="pipe-tile" data-pipe="${index}" aria-label="Conduit ${index+1}, ${kind}, rotation ${rotation*90} degrees" ${kind==='block'?'disabled':''}><svg viewBox="0 0 90 90" aria-hidden="true"><g stroke="#07161e" stroke-width="17" fill="none">${paths}</g><g stroke="${color}" stroke-width="10" fill="none" stroke-linecap="round">${paths}</g>${kind==='block'?'<rect x="25" y="25" width="40" height="40" fill="#293940"/><path d="M32 32l26 26m0-26L32 58" stroke="#64767a" stroke-width="3"/>':`<circle cx="45" cy="45" r="6" fill="${color}"/>`}${index===3?'<text x="3" y="16" fill="#e9b579" font-size="10">IN</text>':index===5?'<text x="63" y="16" fill="#e9b579" font-size="10">OUT</text>':''}</svg><span class="tile-no">${index+1}</span></button>`;
}
function showItem(id) {
  const item=W.ITEMS[id];
  modalOpen(dialogHead('ON YOUR PERSON',item.title,item.description)+`<div class="inspection-visual"><div class="item-art">${itemSvg(id)}</div><span class="visual-caption">MARKED ${esc(item.symbol)}</span></div><p class="muted-note">Matching keys are used when you interact with their locks.</p><button id="item-close" class="secondary">BACK TO THE ROOM</button>`,{kind:'item',id});
  $('#item-close').onclick=closeDialog;
}
function showNotes() {
  const notes=state.inspected.filter(id=>W.ALL_OBJECTS[id]?.clue);
  modalOpen(dialogHead('WHAT YOU HAVE SEEN','Your notes',notes.length?'Every clue you inspect stays here. Revisit it whenever you need.':'Inspect the marks, papers, and monitors in the rooms. Their clues will be kept here.')+`<div class="notes-list">${notes.map(id=>{const o=W.ALL_OBJECTS[id];return `<button data-note="${id}">${esc(o.title)}<span>${esc(W.LEVELS.find(l=>l.objects.some(a=>a.id===id)).rooms.find(r=>r.id===o.room).title)} ↗</span></button>`;}).join('')}</div>`,{kind:'notes'});
  $$('#dialog [data-note]').forEach(b=>b.onclick=()=>{
    const o=W.ALL_OBJECTS[b.dataset.note];modalOpen(dialogHead('CLUE NOTEBOOK',o.title,o.description)+clueVisual(o.clue)+'<button id="notes-back" class="secondary">BACK TO NOTES</button>',{kind:'note',id:o.id});$('#notes-back').onclick=showNotes;
  });
}
function showHints() {
  const hints=W.getHints(state), complete=W.isLevelComplete(state);
  modalOpen(dialogHead(`ACT ${W.LEVELS[state.level].number} / HELP WHEN YOU WANT IT`,'A little direction',`You have ${hints.remaining} of 3 hints left in this level. Each one responds to where you are now.`)+`<div class="hint-dots">${[0,1,2].map(i=>`<span class="hint-dot ${i<hints.used?'used':''}"></span>`).join('')}</div>${hints.log.map((text,i)=>`<div class="hint-entry"><b>0${i+1}</b><span>${esc(text)}</span></div>`).join('')}${hints.remaining&&!complete?actionButton(`USE A HINT · ${hints.remaining} LEFT`,'id="use-hint"'): '<p class="muted-note">You can reread these hints at any time.</p>'}${feedbackSlot}`,{kind:'hints'});
  if($('#use-hint')) $('#use-hint').onclick=()=>dispatch({type:'hint'});
}
function showHelp() {
  modalOpen(dialogHead('YOUR FIRST NIGHT IN BLACKWELL','Look. Connect. Escape.')+`<div class="help-step"><b>01</b><p><strong>Tap the room.</strong>Small diamond markers reveal things you can investigate. “Look closer” shows every object’s name.</p></div><div class="help-step"><b>02</b><p><strong>Keep what matters.</strong>Keys have distinctive shapes. Inspect your inventory and revisit clues in Notes. Some objects are distractions.</p></div><div class="help-step"><b>03</b><p><strong>Watch the prison.</strong>Every clue and warning is visible. You need no sound, fast reflexes, or outside knowledge.</p></div><div class="help-step"><b>?</b><p><strong>Three hints per level.</strong>Hints are optional. Wrong attempts cost nothing. Solo progress saves automatically on this browser.</p></div><button id="help-close" class="primary">I’M READY <span>→</span></button>`,{kind:'help'});
  $('#help-close').onclick=closeDialog;
}
function showSettings() {
  modalOpen(dialogHead('MAKE YOURSELF COMFORTABLE','The details')+`<label class="settings-row"><span>Brighter rooms<p>Lift the shadows for a busy room or a small screen.</p></span><input type="checkbox" id="brighter" ${settings.brighter?'checked':''}></label><label class="settings-row"><span>Reduced movement<p>Keep the atmosphere still. Puzzle indicators stay visible.</p></span><input type="checkbox" id="motion" ${settings.reducedMotion?'checked':''}></label><p class="muted-note">This version is deliberately silent. All puzzles and warnings use visual cues.</p><button class="secondary" id="settings-help">HOW TO PLAY</button><button class="secondary" id="settings-close">RETURN TO THE ROOM</button>`,{kind:'settings'});
  $('#brighter').onchange=e=>{settings.brighter=e.target.checked;persistSettings();};$('#motion').onchange=e=>{settings.reducedMotion=e.target.checked;persistSettings();};
  $('#settings-help').onclick=showHelp;$('#settings-close').onclick=closeDialog;
}
function showPause() {
  modalOpen(dialogHead('TAKE A BREATH','Still on the inside.',mode==='solo'?'Your progress is saved automatically on this browser.':'Your team can keep exploring while you have this menu open.')+actionButton('RETURN TO THE ROOM','id="resume-btn"')+`<button class="secondary" id="pause-help">HOW TO PLAY</button><button class="secondary" id="pause-title">${mode==='solo'?'SAVE & TITLE SCREEN':'LEAVE TEAM & TITLE SCREEN'}</button>`,{kind:'pause'});
  $('#resume-btn').onclick=closeDialog;$('#pause-help').onclick=showHelp;$('#pause-title').onclick=()=>{const team=mode==='coop';if(team)client.leave();goMenu();if(team)mode='solo';};
}
function showCoop(prefill='') {
  const resume=client.resumeInfo;
  modalOpen(dialogHead('PRIVATE TEAM / 2–4 PLAYERS','Get out together.','Explore independently. Share the keys, clues, and three hints per wing. Send your team the room code.')+`<label class="field-label" for="player-name">YOUR CALL SIGN</label><input class="field" id="player-name" maxlength="20" value="${esc(resume?.name||'Inmate 09')}" autocomplete="nickname">${actionButton('CREATE A TEAM','id="create-team" data-connect')}${resume?'<button class="secondary" id="rejoin-team" data-connect>REJOIN '+esc(resume.code)+'</button>':''}<div class="coop-divider">OR JOIN YOUR FRIENDS</div><label class="field-label" for="join-code">SIX-CHARACTER ROOM CODE</label><input class="field room-code-input" id="join-code" maxlength="8" placeholder="ABC234" value="${esc(prefill)}" autocapitalize="characters" autocomplete="off" spellcheck="false"><button class="secondary" id="join-team" data-connect>JOIN THE ESCAPE →</button>${feedbackSlot}<p class="muted-note">Co-op starts a separate escape. Your solo save stays here. Team rooms survive brief disconnects; a server restart ends the team session.</p>`,{kind:'coop'});
  const connect=fn=>{if(mode==='solo')persist();$$('#dialog button[data-connect]').forEach(b=>b.disabled=true);fn();};
  $('#create-team').onclick=()=>connect(()=>client.create($('#player-name').value));
  $('#join-team').onclick=()=>connect(()=>{if(!client.join($('#join-code').value,$('#player-name').value))$$('#dialog button[data-connect]').forEach(b=>b.disabled=false);});
  if($('#rejoin-team'))$('#rejoin-team').onclick=()=>connect(()=>client.reconnect());
  $('#join-code').onkeydown=e=>{if(e.key==='Enter')$('#join-team').click();};
}
function showCrew() {
  if(mode!=='coop')return;
  const url=new URL(location.href);url.search='';url.searchParams.set('join',client.roomCode);
  modalOpen(dialogHead('YOUR PRIVATE ESCAPE','The crew', 'Share this code. Each player can investigate a different room while the team makes progress together.')+`<div class="room-code" aria-label="Team code">${esc(client.roomCode)}</div><div class="dialog-actions"><button class="secondary" id="copy-code">COPY CODE</button><button class="secondary" id="copy-invite">COPY INVITE</button></div>${roster.map(p=>`<div class="crew-member"><span class="player-dot" style="opacity:${p.connected?1:.3}"></span><span>${esc(p.name)}${p.id===client.playerId?' (you)':''}</span><small>${p.connected?esc(W.LEVELS.flatMap(l=>l.rooms).find(r=>r.id===p.room)?.title||'Joining'):'RECONNECTING'}</small></div>`).join('')}${actionButton('START EXPLORING','id="crew-close"')}${!client.connected?'<button class="secondary" id="retry-network">RECONNECT</button>':''}${feedbackSlot}`,{kind:'crew'});
  $('#copy-code').onclick=()=>copyText(client.roomCode);$('#copy-invite').onclick=()=>copyText(url.href);$('#crew-close').onclick=closeDialog;
  if($('#retry-network'))$('#retry-network').onclick=()=>client.reconnect();
}
async function copyText(text) {
  try {await navigator.clipboard.writeText(text);feedback('Copied. Send it to your crew.');}
  catch {feedback('Copy this: '+text);}
}
function checkCompletion() {
  if(!playing||!W.isLevelComplete(state)||completionShown===state.level)return;
  completionShown=state.level;const level=W.LEVELS[state.level];
  modalOpen(`<div class="eyebrow">${state.won?'BLACKWELL / BEYOND THE WALL':'WING CLEARED'}</div><div class="large-act">${state.won?'↗':level.number}</div><h2 id="dialog-title">${state.won?'You are no longer a number.':'One door closer.'}</h2><p>${esc(level.outro)}</p><div class="stats-line"><span>TIME <b>${timeText(elapsed)}</b></span><span>HINTS <b>${state.hintsUsed.reduce((a,b)=>a+b,0)} USED</b></span></div>${actionButton(state.won?'BACK TO THE OUTSIDE':'CONTINUE THE ESCAPE','id="next-level"')}${!state.won?`<button class="secondary" id="completion-title">${mode==='coop'?'LEAVE TEAM & TITLE SCREEN':'SAVE & TITLE SCREEN'}</button>`:''}${feedbackSlot}`,{kind:'complete',unclosable:true});
  $('#next-level').onclick=()=>{if(state.won){const team=mode==='coop';if(team)client.leave();goMenu();if(team)mode='solo';}else dispatch({type:'advance'});};
  if ($('#completion-title')) $('#completion-title').onclick=()=>{const team=mode==='coop';if(team)client.leave();goMenu();if(team)mode='solo';};
}
function updateScanner() {
  const phase=W.scanPhase(mode==='coop'?client.serverNow:Date.now());
  $('#scan-indicator').dataset.safe=String(phase.safe);
  if ($('#scan-text').textContent !== phase.label) $('#scan-text').textContent=phase.label;
  $('#scan-progress').style.width=`${phase.progress*100}%`;
  $$('#dialog [data-scan]').forEach(el=>{el.dataset.safe=String(phase.safe);const text=el.querySelector('[data-scan-label]');const label=`${phase.label} · ${Math.ceil(phase.remaining)}s`;if(text && text.textContent!==label)text.textContent=label;});
  const button=$('#dialog [data-timed]');
  if(button){button.disabled=!phase.safe||!!pendingAction;if(button.dataset.safe!==String(phase.safe)){button.dataset.safe=String(phase.safe);button.innerHTML=phase.safe?'REACH FOR THE KEY <span>→</span>':'WAIT FOR THE BLIND SPOT <span>◷</span>';}}
}
function objectHeight(o) {
  if(o.position.z!==undefined)return o.position.z;
  if(o.prop==='note')return o.position.y<1?2:.45;
  if(['door','gate','locker','cage'].includes(o.prop))return 1.5;
  if(['panel','monitor','terminal','shelf'].includes(o.prop))return 1.55;
  if(['desk','generator','cart'].includes(o.prop))return 1.1;
  if(o.prop==='window')return 2.2;
  if(o.prop==='grate')return .15;
  return .85;
}
function frame(now) {
  requestAnimationFrame(frame);
  if(document.hidden||now-lastFrame<32)return;
  lastFrame=now;
  const t=Date.now();
  if(playing){elapsed=mode==='coop'?Math.max(0,(client.serverNow-state.startedAt)/1000):elapsed+Math.min(1,(t-lastClock)/1000);gameArt.render(settings.reducedMotion?0:now,state,W.getObjects(state,room),{reducedMotion:settings.reducedMotion,selected:modal?.kind==='object'?modal.id:null,scanSafe:W.scanPhase(mode==='coop'?client.serverNow:t).safe});
    for(const button of $$('#hotspots button')){const o=W.ALL_OBJECTS[button.dataset.object],p=gameArt.project(o.position.x,o.position.y,objectHeight(o));button.style.left=p.x+'px';button.style.top=p.y+'px';}
    const clockText=timeText(elapsed);if($('#elapsed').textContent!==clockText)$('#elapsed').textContent=clockText;updateScanner();
  }else menuArt.render(settings.reducedMotion?0:now,{},W.LEVELS[0].objects.filter(o=>o.room==='cell'),{reducedMotion:settings.reducedMotion});
  lastClock=t;
}

$('#start-btn').onclick=()=>{
  if(saved&&!saved.state.won) {
    modalOpen(dialogHead('A FRESH START','Leave this escape behind?','Starting again replaces your saved solo escape on this browser.')+actionButton('START AGAIN','id="confirm-new"')+'<button class="secondary" id="keep-save">KEEP MY ESCAPE</button>',{kind:'new'});
    $('#confirm-new').onclick=()=>startSolo();$('#keep-save').onclick=closeDialog;
  }else startSolo();
};
$('#continue-btn').onclick=()=>startSolo(true);$('#coop-btn').onclick=()=>showCoop();$('#how-btn').onclick=showHelp;
$('#close-dialog').onclick=closeDialog;$('#overlay').onclick=e=>{if(e.target===$('#overlay')&&!modal?.unclosable)closeDialog();};
$('#inspect-btn').onclick=()=>{labels=!labels;$('#hotspots').classList.toggle('show-labels',labels);$('#inspect-btn').setAttribute('aria-pressed',String(labels));};
$('#notebook-btn').onclick=showNotes;$('#hint-btn').onclick=showHints;$('#pause-btn').onclick=showPause;$('#settings-btn').onclick=showSettings;$('#crew-btn').onclick=showCrew;
document.addEventListener('keydown',e=>{
  if(e.key==='Escape'&&!modal?.unclosable){if(modal)closeDialog();else if(playing)showPause();}
  if(e.key==='Tab'&&modal){const focusable=$$('#dialog button:not([disabled]):not([hidden]),#dialog input:not([disabled])');const first=focusable[0],last=focusable[focusable.length-1];if(e.shiftKey&&(document.activeElement===first||document.activeElement===$('#dialog'))){e.preventDefault();last?.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus();}}
});
document.addEventListener('visibilitychange',()=>{if(document.hidden)persist();lastClock=Date.now();});
window.addEventListener('pagehide',persist);
setInterval(()=>{if(playing&&!document.hidden)persist();},5000);
applySettings();refreshMenu();requestAnimationFrame(frame);
const invite=new URL(location.href).searchParams.get('join');if(invite)showCoop(invite);
