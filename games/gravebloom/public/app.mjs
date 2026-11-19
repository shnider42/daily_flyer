import * as Sim from './sim.mjs';
import * as Art from './renderer.mjs';
import { AudioBus } from './audio.mjs';

const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const icon = name => `<svg aria-hidden="true"><use href="#i-${name}"/></svg>`;
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
const STORAGE = { settings: 'gravebloom.settings.v1', save: 'gravebloom.solo.v1', records: 'gravebloom.chronicle.v1', session: 'gravebloom.party.v1' };
function read(key, fallback, storage = localStorage) { try { return JSON.parse(storage.getItem(key)) ?? fallback; } catch { return fallback; } }
function write(key, value, storage = localStorage) { try { storage.setItem(key, JSON.stringify(value)); return true; } catch { return false; } }
function erase(key, storage = localStorage) { try { storage.removeItem(key); } catch {} }
const settings = { sound: true, volume: .3, guidance: 'simple', shake: true, name: '', classId: 'warrior', difficulty: 'normal', ...read(STORAGE.settings, {}) };
const audio = new AudioBus({ enabled: settings.sound, volume: settings.volume });
const renderer = new Art.Renderer($('#world'));
const coarse = matchMedia('(pointer: coarse)').matches;
let mode = 'menu', game = null, playerId = null, selectedClass = Sim.CLASSES[settings.classId] ? settings.classId : 'warrior';
let paused = false, modalKind = null, modalData = null, lastModalSignature = '', frameAt = performance.now(), frameAccum = 0, hudAt = 0, saveAt = 0, networkAt = 0;
let socket = null, session = null, lobby = null, connectionGeneration = 0, reconnectTimer = 0, reconnectAttempts = 0, connecting = false, seq = 0, latency = 0, packetAt = 0, gotFirstSnapshot = false;
let previousSnapshot = null, currentSnapshot = null, snapshotAt = 0, renderState = null, networkWorldKey = '';
let currentZone = -1, observedWorldKey = '', currentPhase = '', seenMessages = new Set(), knownItems = new Set(), oldHp = null, oldLevel = 1, oldCooldowns = {}, runRecorded = false, startedAt = 0;
let pointer = { x: innerWidth / 2, y: innerHeight / 2, active: false, attack: false }, joystick = { x: 0, y: 0, pointerId: null };
const keys = new Set(), held = {}, pulses = {}, explored = new Set();
const CLASS_UI = {
  warrior: { role: 'STEEL & SURVIVAL', primary: 'sword', skill1: 'shield', skill2: 'heart', short1: 'Slam', short2: 'Rally' },
  archer: { role: 'DISTANCE & CONTROL', primary: 'bow', skill1: 'bow', skill2: 'trap', short1: 'Volley', short2: 'Snare' },
  wizard: { role: 'FROST & CHAIN REACTIONS', primary: 'staff', skill1: 'snow', skill2: 'spark', short1: 'Frost', short2: 'Storm' },
};

function me() { return game?.players?.find(p => p.id === playerId); }
function saveSettings() { write(STORAGE.settings, settings); }
function setText(selector, text) { const node = $(selector); if (node && node.textContent !== String(text)) node.textContent = text; }
function status(message, ms = 5000) { $('#menu-status').textContent = message; clearTimeout(status.timer); if (ms) status.timer = setTimeout(() => { $('#menu-status').textContent = ''; }, ms); }
function toast(message, rarity) {
  const div = document.createElement('div'); div.className = `toast${rarity ? ' loot' : ''}`; div.textContent = message;
  if (rarity) div.style.setProperty('--rarity-color', Sim.RARITIES[rarity]?.color || '#e2cd94');
  $('#toasts').append(div); while ($('#toasts').children.length > 5) $('#toasts').firstElementChild.remove();
  setTimeout(() => div.remove(), 4000);
}
function selectClass(classId) {
  selectedClass = classId; settings.classId = classId; saveSettings();
  const c = Sim.CLASSES[classId], ui = CLASS_UI[classId];
  $$('.class-card').forEach(button => { const yes = button.dataset.class === classId; button.classList.toggle('selected', yes); button.setAttribute('aria-pressed', yes); });
  $('#class-role').textContent = ui.role;
  $('#class-description').innerHTML = `<strong>${esc(c.description)}</strong><div class="skill-list"><span>${icon(ui.primary)}${esc(c.primary.name)}</span><span>${icon(ui.skill1)}${esc(ui.short1)}</span><span>${icon(ui.skill2)}${esc(ui.short2)}</span></div>`;
  for (const canvas of $$('[data-portrait]')) { if (Art.drawPortrait) Art.drawPortrait(canvas, canvas.dataset.portrait, canvas.dataset.portrait === classId); }
}
function configureHud() {
  const p = me(); if (!p) return; const c = Sim.CLASSES[p.classId], ui = CLASS_UI[p.classId];
  $('#hero-emblem').innerHTML = icon(ui.primary); $('#hero-emblem').style.color = c.color;
  for (const [key, name] of [['primary', 'primary'], ['skill1', 'skill1'], ['skill2', 'skill2']]) { $(`#${name}-name`).textContent = c[key].name; $(`#${name}-icon`).setAttribute('href', `#i-${ui[key]}`); }
  $('#touch-attack-icon').setAttribute('href', `#i-${ui.primary}`);
  $('#touch-skill1-icon').setAttribute('href', `#i-${ui.skill1}`); $('#touch-skill2-icon').setAttribute('href', `#i-${ui.skill2}`);
  $('#touch-skill1-label').textContent = ui.short1; $('#touch-skill2-label').textContent = ui.short2;
  $$('.ability').forEach(button => { const key = button.dataset.input === 'attack' ? 'primary' : button.dataset.input; button.title = c[key]?.description || (key === 'dodge' ? 'Dodge toward your movement. Briefly avoid damage.' : 'Restore health. Recharges after 18 seconds.'); });
}
function enterGame(nextMode, nextGame, id) {
  mode = nextMode; game = nextGame; playerId = id; paused = false; currentZone = -1; observedWorldKey = ''; currentPhase = ''; seenMessages.clear(); knownItems.clear(); explored.clear(); runRecorded = false;
  oldHp = null; oldLevel = me()?.level || 1; oldCooldowns = {}; startedAt = performance.now(); frameAccum = 0;
  for (const item of me()?.inventory || []) knownItems.add(item.id);
  closeModal(true); $('#menu').hidden = true; $('#hud').hidden = false; document.body.classList.add('playing'); $('#first-help').style.opacity = '1'; $('#toasts').replaceChildren();
  configureHud(); resetInput(); observeState(); updateHud(); audio.unlock(); audio.play('boss');
}
function startSolo(saved) {
  settings.name = $('#hero-name').value.trim(); settings.difficulty = $('#difficulty').value; saveSettings();
  leaveNetwork(); audio.unlock();
  try {
    let next;
    if (saved && Sim.restoreGame) next = Sim.restoreGame(saved);
    else if (saved) next = saved;
    else { next = Sim.createGame({ seed: cryptoSeed(), difficulty: $('#difficulty').value }); Sim.addPlayer(next, { id: 'solo', name: $('#hero-name').value.trim() || 'Wanderer', classId: selectedClass }); }
    if (!next || !next.players?.length || !next.map) throw new Error('This save cannot be read. You can start a new journey.');
    enterGame('solo', next, next.players[0].id); persistSolo();
  } catch (error) { status(error.message || 'Unable to continue this journey. Start a new one.'); }
}
function cryptoSeed() { return crypto.getRandomValues(new Uint32Array(2)).join('-'); }
function persistSolo() {
  if (mode !== 'solo' || !game) return;
  if (game.phase === 'victory' || game.phase === 'defeat') { erase(STORAGE.save); return; }
  try { write(STORAGE.save, Sim.serializeGame ? Sim.serializeGame(game) : game); } catch { /* The current journey can continue when storage is unavailable. */ }
}
function goCamp() {
  if (mode === 'solo') persistSolo(); leaveNetwork(); mode = 'menu'; game = null; playerId = null; currentSnapshot = null; previousSnapshot = null; resetInput(); paused = false;
  closeModal(true); $('#menu').hidden = false; $('#hud').hidden = true; $('#connection-overlay').hidden = true; document.body.classList.remove('playing'); refreshContinue();
}
function refreshContinue() { $('#continue').hidden = !read(STORAGE.save, null); }
function resetInput() { keys.clear(); pointer.attack = false; for (const k of Object.keys(held)) held[k] = false; for (const k of Object.keys(pulses)) delete pulses[k]; joystick.x = joystick.y = 0; joystick.pointerId = null; $('#stick-thumb').style.transform = ''; }

function makeInput() {
  const p = me(); if (!p) return {};
  let mx = (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0) - (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0);
  let my = (keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0) - (keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0);
  if (joystick.pointerId !== null) { mx = joystick.x; my = joystick.y; }
  const length = Math.hypot(mx, my); if (length > 1) { mx /= length; my /= length; }
  const now = performance.now(), pressed = (key, codes = []) => !!held[key] || (pulses[key] || 0) > now || codes.some(code => keys.has(code));
  let aim = pointer.active && !coarse ? renderer.screenToWorld(pointer.x, pointer.y) : null;
  if (!aim || !Number.isFinite(aim.x) || !Number.isFinite(aim.y)) {
    let nearest = null, distance = 700;
    for (const enemy of game.enemies) { const d = Math.hypot(p.x - enemy.x, p.y - enemy.y); if (enemy.hp > 0 && d < distance && lineOfSight(p, enemy)) { nearest = enemy; distance = d; } }
    aim = nearest || { x: p.x + (mx || Math.cos(p.facing || 0)) * 160, y: p.y + (my || Math.sin(p.facing || 0)) * 160 };
  }
  return { mx, my, aimX: aim.x, aimY: aim.y, attack: pointer.attack || pressed('attack', ['KeyJ']), skill1: pressed('skill1', ['KeyQ', 'KeyK']), skill2: pressed('skill2', ['KeyE', 'KeyL']), dodge: pressed('dodge', ['Space']), interact: pressed('interact', ['KeyF']), potion: pressed('potion', ['KeyR']) };
}
function lineOfSight(a, b) {
  if (!game?.map) return false; const m = game.map, dist = Math.hypot(a.x - b.x, a.y - b.y), steps = Math.ceil(dist / 20);
  for (let i = 1; i < steps; i++) { const x = Math.floor((a.x + (b.x - a.x) * i / steps) / m.tileSize), y = Math.floor((a.y + (b.y - a.y) * i / steps) / m.tileSize); if (!m.tiles[y * m.width + x]) return false; }
  return true;
}
function send(payload) { if (socket?.readyState === WebSocket.OPEN) { socket.send(JSON.stringify(payload)); return true; } return false; }
function perform(action) {
  audio.unlock();
  if (mode === 'online') send({ type: 'action', action });
  else if (mode === 'solo' && game) { const result = Sim.action(game, playerId, action); if (result?.error) toast(result.error); observeState(); updateHud(); persistSolo(); }
  lastModalSignature = '';
}
function leaveNetwork() {
  connectionGeneration++; clearTimeout(reconnectTimer); reconnectAttempts = 0; connecting = false;
  if (socket) { if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: 'leave' })); socket.onclose = null; socket.close(); }
  socket = null; session = null; lobby = null; erase(STORAGE.session, sessionStorage); $('#connection-overlay').hidden = true; setBusy(false);
}
function setBusy(busy) { for (const id of ['#solo', '#host', '#join']) $(id).disabled = busy; }
function connectParty(type, extra = {}) {
  settings.name = $('#hero-name').value.trim(); settings.difficulty = $('#difficulty').value; saveSettings();
  audio.unlock();
  if (connecting) return; connecting = true; setBusy(true); status(type === 'resume' ? 'Finding your party…' : 'Opening the road…', 0);
  const generation = ++connectionGeneration;
  if (socket) { socket.onclose = null; socket.close(); }
  const url = new URL('/ws', location.href); url.protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
  const ws = new WebSocket(url); socket = ws;
  const timeout = setTimeout(() => { if (generation !== connectionGeneration || ws.readyState === WebSocket.OPEN) return; ws.close(); status('The party server is waking up. Try again in a moment.', 10000); connecting = false; setBusy(false); }, 20000);
  ws.onopen = () => { clearTimeout(timeout); if (generation !== connectionGeneration) return ws.close(); seq = 0; ws.send(JSON.stringify(type === 'resume' ? { type, ...extra } : { type, name: $('#hero-name').value.trim() || 'Wanderer', classId: selectedClass, difficulty: $('#difficulty').value, ...extra })); };
  ws.onmessage = event => {
    if (generation !== connectionGeneration) return;
    let message; try { message = JSON.parse(event.data); } catch { return; }
    if (message.type === 'welcome') {
      connecting = false; setBusy(false); status(''); reconnectAttempts = 0; playerId = message.playerId;
      session = { code: message.code, token: message.token }; write(STORAGE.session, session, sessionStorage);
      lobby = { code: message.code, hostId: message.hostId, players: message.state.players, started: message.started };
      game = message.state; networkWorldKey = message.worldKey || JSON.stringify([game.seed, game.run, game.zoneIndex]); packetAt = performance.now(); currentSnapshot = game; previousSnapshot = game; snapshotAt = packetAt;
      $('#connection-overlay').hidden = true;
      if (message.started) enterGame('online', message.state, playerId); else { mode = 'online'; openLobby(); }
    } else if (message.type === 'lobby') {
      const oldHost = lobby?.hostId; lobby = message; if (modalKind === 'lobby') renderLobby();
      if (oldHost !== lobby.hostId && modalKind === 'choice') openChoice();
      if (oldHost !== lobby.hostId && modalKind === 'result') openResult();
      if (message.started && !$('#hud').hidden) setText('#net-label', `${message.code} · ${latency ? latency + ' ms' : 'ONLINE'}`);
    } else if (message.type === 'started') { networkWorldKey = message.worldKey || JSON.stringify([message.state.seed, message.state.run, message.state.zoneIndex]); currentSnapshot = message.state; previousSnapshot = message.state; snapshotAt = performance.now(); enterGame('online', message.state, playerId); }
    else if (message.type === 'state') {
      const incomingKey = message.worldKey || JSON.stringify([message.state.seed, message.state.run, message.state.zoneIndex]);
      if (!message.state.map) {
        if (!currentSnapshot?.map || incomingKey !== networkWorldKey) { send({ type: 'sync' }); return; }
        message.state.map = { ...currentSnapshot.map, ...message.mapState };
      }
      packetAt = performance.now(); previousSnapshot = incomingKey === networkWorldKey ? currentSnapshot || message.state : message.state; networkWorldKey = incomingKey; currentSnapshot = message.state; snapshotAt = packetAt; game = message.state;
      if (lobby?.started && $('#hud').hidden) enterGame('online', game, playerId);
      observeState();
    } else if (message.type === 'error') {
      connecting = false; setBusy(false); status(message.message, 9000); if (mode !== 'menu') toast(message.message);
      if (type === 'resume' && ['ROOM_NOT_FOUND', 'RESUME_EXPIRED'].includes(message.code)) {
        session = null; erase(STORAGE.session, sessionStorage); clearTimeout(reconnectTimer); ws.onclose = null; ws.close(); socket = null;
        if (mode === 'online') { $('#connection-overlay').hidden = false; $('#connection-overlay h2').textContent = 'The road has closed.'; $('#connection-overlay p').textContent = message.message; }
        else $('#connection-overlay').hidden = true;
      } else if (!session) { ws.onclose = null; ws.close(); socket = null; }
      if (type === 'resume' && !session) erase(STORAGE.session, sessionStorage);
    } else if (message.type === 'pong') latency = Math.max(0, Math.round(performance.now() - message.at));
    else if (message.type === 'left') { /* Explicit leave is handled locally. */ }
  };
  ws.onerror = () => { if (generation === connectionGeneration && !session) status('Could not reach the party server. Solo play is still available.', 10000); };
  ws.onclose = () => {
    clearTimeout(timeout); if (generation !== connectionGeneration) return; connecting = false; setBusy(false);
    if (session && mode === 'online') {
      $('#connection-overlay').hidden = false; resetInput();
      if (++reconnectAttempts < 15) reconnectTimer = setTimeout(() => connectParty('resume', session), Math.min(5000, 500 + reconnectAttempts * 350));
      else { $('#connection-overlay h2').textContent = 'The road has closed.'; $('#connection-overlay p').textContent = 'This party could not be restored. Return to camp and gather again.'; }
    } else if (type !== 'resume') status('Connection closed. You can try joining again.', 6000);
  };
}

function showModal(kind, eyebrow, title, body, { locked = false, wide = false } = {}) {
  modalKind = kind; lastModalSignature = ''; $('#modal-eyebrow').textContent = eyebrow; $('#modal-title').textContent = title; $('#modal-body').innerHTML = body;
  $('#modal-close').hidden = locked; $('#modal').style.width = wide ? 'min(900px,100%)' : ''; $('#modal-backdrop').hidden = false;
  paused = mode === 'solo'; resetInput();
  if (mode === 'online' && lobby?.started) send({ type: 'input', seq: ++seq, input: { mx: 0, my: 0, aimX: me()?.x || 0, aimY: me()?.y || 0 } });
  requestAnimationFrame(() => { const target = $('#modal-close').hidden ? $('#modal-body button') : $('#modal-close'); target?.focus({ preventScroll: true }); });
}
function closeModal(force = false) {
  if (!force && game?.phase === 'choice' && modalKind !== 'choice') { openChoice(); return; }
  if (!force && ['choice', 'result', 'lobby'].includes(modalKind)) return;
  modalKind = null; modalData = null; $('#modal-backdrop').hidden = true; paused = false; resetInput();
}
function openLobby() { showModal('lobby', 'THE FIRE IS LIT', 'Gather your party', '', { locked: true }); renderLobby(); }
function renderLobby() {
  if (!lobby) return; const amHost = lobby.hostId === playerId, people = lobby.players || [];
  $('#modal-body').innerHTML = `<p>Share this code or copy an invite link. Choose your class before joining. Up to four wanderers can travel together.</p><div class="lobby-code">${esc(lobby.code)}</div><div class="modal-actions"><button class="button" data-act="copy-invite">Copy invite link</button><button class="text-button" data-act="copy-code">Copy code</button></div><div class="party-list">${Array.from({ length: 4 }, (_, i) => { const p = people[i]; return p ? `<div class="party-slot"><strong>${esc(p.name)}${p.id === playerId ? ' · you' : ''}</strong><span>${esc(Sim.CLASSES[p.classId]?.name || p.classId)}${p.id === lobby.hostId ? ' · host' : ''}${p.connected === false ? ' · reconnecting' : ''}</span></div>` : '<div class="party-slot empty">Waiting by the fire…</div>'; }).join('')}</div><div class="modal-actions">${amHost ? '<button class="button primary" data-act="start-party">Begin the descent</button>' : '<p class="modal-note">Your host will begin when everyone is here.</p>'}<button class="text-button" data-act="camp">Leave party</button></div><p class="modal-note">Friends can join while you play. Everyone gets their own equipment. This party lasts until the server restarts; reconnects are held for 90 seconds.</p>`;
}
function openGuide() {
  showModal('guide', 'A FEW THINGS TO KNOW', 'Keep your heart beating', `<p>Explore the corridors, collect equipment, and find the area’s boss. Defeat three bosses to finish a journey. At each heart, choose power with a cost or a blessing that makes you sturdier.</p><h3>${coarse ? 'On your phone' : 'At your keyboard'}</h3>${coarse ? '<p>Move with the left thumbstick. Hold <strong>Attack</strong> to aim at the nearest visible enemy. Use the two smaller ability buttons above it, and <strong>Dodge</strong> to escape red attack zones. The hand opens chests and revives allies; the bottle heals.</p>' : '<div class="guide-grid"><div class="guide-row"><span>Move</span><kbd>WASD / arrows</kbd></div><div class="guide-row"><span>Aim & attack</span><kbd>Mouse · hold left</kbd></div><div class="guide-row"><span>Class abilities</span><kbd>Q / E</kbd></div><div class="guide-row"><span>Dodge through danger</span><kbd>Space</kbd></div><div class="guide-row"><span>Healing potion</span><kbd>R</kbd></div><div class="guide-row"><span>Open / hold to revive</span><kbd>F</kbd></div><div class="guide-row"><span>Equipment / map</span><kbd>I / M</kbd></div><div class="guide-row"><span>Pause / options</span><kbd>Esc</kbd></div></div>'}<h3>Fight together</h3><p>Poison a group with an archer, then hit it with a wizard’s fire to set off an eruption. Freeze enemies before chain lightning to shatter them. A warrior’s slam pulls foes close, and Rally helps everyone nearby.</p><h3>Read the ground</h3><p>Red shapes warn where a boss will strike. Walk over loot to pick it up. Open your pack to compare and equip it. A dropped ally can be revived by holding ${coarse ? 'the hand button' : 'F'} beside them. If everyone falls, the journey ends.</p><p class="modal-note">Solo journeys save on this browser and pause while a menu is open. Online combat keeps moving when you open equipment or settings.</p><div class="modal-actions"><button class="button primary" data-act="close">Understood</button></div>`);
}
function openPause() {
  const net = mode === 'online';
  showModal('pause', net ? 'YOUR PARTY IS STILL PLAYING' : 'TAKE A BREATH', net ? 'At the edge of the fire' : 'Journey paused', `<div class="settings-row"><label for="guidance">Guidance</label><select id="guidance"><option value="simple">Simple · plain explanations</option><option value="moderate">Moderate · fewer reminders</option><option value="expert">Expert · essentials only</option></select></div><div class="settings-row"><label for="audio-enabled">Sound effects</label><input type="checkbox" id="audio-enabled" ${settings.sound ? 'checked' : ''}></div><div class="settings-row"><label for="audio-volume">Volume</label><input id="audio-volume" type="range" min="0" max="1" step="0.05" value="${settings.volume}"></div><div class="settings-row"><label for="shake-enabled">Screen shake</label><input type="checkbox" id="shake-enabled" ${settings.shake ? 'checked' : ''}></div>${net ? `<p class="modal-note">Party ${esc(session?.code || '')}. Combat continues while this menu is open.</p><button class="text-button" data-act="copy-invite">Copy party invite</button>` : '<p class="modal-note">Your current solo journey is saved on this browser.</p>'}<div class="modal-actions"><button class="button primary" data-act="close">Return to the fight</button><button class="button" data-act="guide">Controls & help</button><button class="text-button" data-act="camp">Return to camp</button></div>`);
  $('#guidance').value = settings.guidance; persistSolo();
}
function inventorySignature() { const p = me(); return p ? p.inventory.map(i => i.id).join(',') + Object.values(p.equipment).map(i => i?.id).join(',') + p.gold : ''; }
function openInventory() { if (!me()) return; showModal('inventory', 'WHAT THE DEAD LEFT BEHIND', 'Equipment', '', { wide: true }); renderInventory(); }
function itemCard(item, slot, equipped = false) {
  if (!item) return `<div class="item-card"><span class="item-slot">${esc(slot)}</span><strong>Nothing equipped</strong><small>The next chamber may have something.</small></div>`;
  const p = me(), existing = p?.equipment[item.slot], stat = item.slot === 'weapon' ? 'damage' : item.slot === 'armor' ? 'armor' : 'crit';
  const better = !equipped && (item.stats?.[stat] || 0) > (existing?.stats?.[stat] || 0);
  return `<button class="item-card" style="--rarity-color:${Sim.RARITIES[item.rarity]?.color || '#ddd'}" data-act="item" data-item="${esc(item.id)}"><span class="item-slot">${equipped ? 'WORN · ' : ''}${esc(item.slot)} · LV ${item.level}</span>${better ? '<span class="upgrade">+ UPGRADE</span>' : ''}<strong>${esc(item.name)}</strong><small>${itemStats(item).slice(0, 2).map(s => esc(s[1] + ' ' + s[0])).join(' · ')}${item.affixes?.length ? `<br>${item.affixes.map(a => esc(a.name)).join(' · ')}` : ''}</small></button>`;
}
function itemStats(item) { const labels = { damage: 'Damage', armor: 'Armor', hp: 'Max health', speed: 'Move speed', crit: 'Crit chance' }; return Object.entries(item.stats || {}).filter(([, n]) => n).map(([k, n]) => [labels[k] || k, k === 'crit' ? '+' + Math.round(n * 100) + '%' : '+' + Math.round(n * 10) / 10, k, n]); }
function renderInventory() {
  const p = me(); if (!p) return; lastModalSignature = inventorySignature();
  $('#modal-body').innerHTML = `<div class="pack-stats"><span>Damage<b>${Math.round(p.stats.damage)}</b></span><span>Armor<b>${Math.round(p.stats.armor)}</b></span><span>Critical<b>${Math.round(p.stats.crit * 100)}%</b></span><span>Gold<b>${p.gold}</b></span><span>Pack<b>${p.inventory.length}/30</b></span></div><div class="equipped-grid">${['weapon', 'armor', 'charm'].map(slot => itemCard(p.equipment[slot], slot, true)).join('')}</div><h3>In your pack</h3>${p.inventory.length ? `<div class="pack-grid">${p.inventory.map(item => itemCard(item, item.slot)).join('')}</div>` : '<p class="pack-empty">Walk over dropped equipment to collect it.<br>Open a chest with the hand button or F.</p>'}<p class="modal-note">Tap an item to compare it. Equip your finds, or spend gold to temper your current weapon.${mode === 'online' ? ' The party is still fighting while you look.' : ''}</p><div class="modal-actions"><button class="button primary" data-act="close">${game.phase === 'choice' ? 'Return to the heart' : 'Back to the journey'}</button></div>`;
}
function showItem(id) {
  const p = me(), item = p.inventory.find(i => i.id === id) || Object.values(p.equipment).find(i => i?.id === id); if (!item) return;
  const current = p.equipment[item.slot], equipped = current?.id === item.id; modalData = id;
  const temperPrice = Sim.temperCost ? Sim.temperCost(p) : 45 + 15 * p.level + 25 * (item.temper || 0);
  const equippedActions = `<span class="modal-note">Currently equipped${item.temper ? ' · Tempered ' + item.temper + '/3' : ''}</span>${item.slot === 'weapon' && (item.temper || 0) < 3 ? `<button class="button primary" data-act="temper" ${p.gold < temperPrice ? 'disabled' : ''}>Temper · +${3 + game.floor * 2} damage · ${temperPrice} gold</button>` : ''}`;
  showModal('item', `${Sim.RARITIES[item.rarity]?.name || item.rarity} ${item.slot} · level ${item.level}`, item.name, `<div class="item-detail" style="--rarity-color:${Sim.RARITIES[item.rarity]?.color}"><p>${esc(item.description)}</p><h3>Properties</h3>${itemStats(item).map(([label, value, key, n]) => { const difference = n - (current?.stats?.[key] || 0), delta = key === 'crit' ? Math.round(difference * 100) + '%' : Math.round(difference * 10) / 10; return `<div class="item-stat"><span>${esc(label)}</span><span>${esc(value)} ${!equipped && difference ? `<small class="${difference > 0 ? 'stat-better' : 'stat-worse'}">(${difference > 0 ? '+' : ''}${delta} vs worn)</small>` : ''}</span></div>`; }).join('')}${item.affixes.map(a => `<p class="affix"><strong>${esc(a.name)}</strong><br>${esc(a.description)}</p>`).join('')}${!equipped && current ? `<p class="modal-note">Replaces: ${esc(current.name)}</p>` : ''}</div><div class="modal-actions">${equipped ? equippedActions : `<button class="button primary" data-act="equip" data-item="${esc(item.id)}">Equip</button><button class="button" data-act="salvage" data-item="${esc(item.id)}">Salvage · ${item.value} gold</button><button class="text-button" data-act="drop" data-item="${esc(item.id)}">Drop</button>`}<button class="text-button" data-act="inventory">Back to equipment</button></div>`);
}
function openMap() { if (!game) return; showModal('map', `AREA ${game.zoneIndex + 1} OF 3`, game.zoneName, '<canvas id="large-map" class="map-large" width="780" height="480" aria-label="Explored dungeon map"></canvas><div class="map-legend"><span>Gold · you</span><span>Blue · friends</span><span>Red · the boss</span><span>Amber · chest</span></div><p class="modal-note">The map fills in as you explore. Follow the connected corridors; chests often lie off the main path.</p>'); drawMap($('#large-map'), true); }
function openChoice() {
  const zone = Sim.ZONES[game.zoneIndex], canChoose = mode !== 'online' || lobby?.hostId === playerId;
  showModal('choice', 'A SAINT HAS FALLEN', zone.heart, `<p class="choice-intro">The body is still. The heart is not.<br>Some things are not meant to be carried.</p><div class="choices"><button class="choice-card claim" data-act="claim" ${canChoose ? '' : 'disabled'}>${icon('heart')}<strong>Keep the heart</strong><p>${esc(zone.heartDescription)}</p><small>More powerful enemies. Better odds of exceptional loot.</small></button><button class="choice-card cleanse" data-act="cleanse" ${canChoose ? '' : 'disabled'}>${icon('spark')}<strong>Lay it to rest</strong><p>Your party gains 20 maximum health and recovers. Leave this part of the curse behind.</p><small>A steadier journey. No added corruption.</small></button></div><p class="modal-note">${canChoose ? 'Your choice affects the whole party.' : 'The host chooses for the party. Discuss the choice before continuing.'} ${game.zoneIndex < 2 ? `Next: ${esc(Sim.ZONES[game.zoneIndex + 1].name)}.` : 'This is the last heart. Your journey is almost over.'}</p><button class="text-button" data-act="choice-equipment">Inspect your new boss loot</button>`, { locked: true });
}
function openResult() {
  const victory = game.phase === 'victory', p = me(); recordRun();
  showModal('result', victory ? 'THREE SAINTS. THREE SILENCES.' : 'THE ROOTS TAKE ANOTHER', victory ? 'Something followed you home.' : 'The garden remembers.', `<p>${victory ? (game.corruption ? 'You broke the crown and carried its gifts out of the dark. Whether that was mercy remains to be seen.' : 'You laid every heart to rest. For the first time in years, the bells have stopped.') : 'Your party fell, but the road is still there. A different class, a better dodge, a new path through the dark.'}</p><div class="run-stat-grid"><div class="run-stat"><strong>${game.kills}</strong><span>Enemies defeated</span></div><div class="run-stat"><strong>${p?.level || 1}</strong><span>Level reached</span></div><div class="run-stat"><strong>${game.corruption}</strong><span>Hearts claimed</span></div></div><div class="modal-actions">${mode === 'solo' || lobby?.hostId === playerId ? '<button class="button primary" data-act="new-journey">Walk the road again</button>' : '<p class="modal-note">Your host can begin another journey.</p>'}<button class="button" data-act="camp">Return to camp</button></div><p class="modal-note">Every new journey rolls a different route and new equipment. Your chronicle stays on this browser.</p>`, { locked: true });
}
function recordRun() {
  if (runRecorded) return; runRecorded = true; const p = me(), r = read(STORAGE.records, { journeys: 0, victories: 0, kills: 0, highestLevel: 1, legendary: 0 });
  r.journeys++; if (game.phase === 'victory') r.victories++; r.kills += game.kills; r.highestLevel = Math.max(r.highestLevel, p?.level || 1);
  r.legendary += (p?.inventory || []).concat(Object.values(p?.equipment || {}).filter(Boolean)).filter(i => i.rarity === 'legendary').length;
  write(STORAGE.records, r); if (mode === 'solo') erase(STORAGE.save);
}
function openRecords() { const r = read(STORAGE.records, { journeys: 0, victories: 0, kills: 0, highestLevel: 1, legendary: 0 }); showModal('records', 'WHAT SURVIVES', 'Your chronicle', `<div class="record-list">${[['Journeys ended', r.journeys], ['Crowns broken', r.victories], ['Enemies defeated', r.kills], ['Highest level', r.highestLevel], ['Legendary items carried home', r.legendary]].map(([label, value]) => `<div><span>${label}</span><strong>${value}</strong></div>`).join('')}</div><p class="modal-note">Saved on this browser. These are memories of your journeys; each new journey starts fresh.</p>`); }

function observeState() {
  if (!game || $('#hud').hidden) return; const p = me(); if (!p) return;
  const worldKey = JSON.stringify([game.seed, game.run, game.zoneIndex]);
  if (observedWorldKey !== worldKey) {
    observedWorldKey = worldKey; currentZone = game.zoneIndex; explored.clear(); oldHp = null; if (!['playing', 'menu'].includes(currentPhase) && modalKind) closeModal(true);
    if (game.zoneIndex === 0 && currentPhase && currentPhase !== 'playing') { runRecorded = false; knownItems.clear(); seenMessages.clear(); oldLevel = p.level; startedAt = performance.now(); }
    $('#notice').innerHTML = `<span>AREA ${game.zoneIndex + 1} · ${game.corruption ? 'THE CURSE DEEPENS' : 'THE DESCENT'}</span><strong>${esc(game.zoneName)}</strong>`;
    $('#notice').classList.add('show'); clearTimeout(observeState.noticeTimer); observeState.noticeTimer = setTimeout(() => $('#notice').classList.remove('show'), 3400); configureHud();
  }
  if (currentPhase !== game.phase) {
    currentPhase = game.phase;
    if (game.phase === 'choice') { audio.play('level'); openChoice(); }
    else if (['defeat', 'victory'].includes(game.phase)) { openResult(); }
    else if (['choice', 'result'].includes(modalKind)) closeModal(true);
  }
  for (const message of game.messages || []) if (!seenMessages.has(message.id)) { seenMessages.add(message.id); if (message.kind !== 'area' && game.time - message.time < 4) toast(message.text); }
  if (seenMessages.size > 200) seenMessages = new Set((game.messages || []).map(m => m.id));
  for (const item of p.inventory) if (!knownItems.has(item.id)) { knownItems.add(item.id); toast(item.name, item.rarity); audio.play('loot'); }
  if (oldHp !== null && p.hp < oldHp - .5) audio.play('hurt'); oldHp = p.hp;
  if (p.level > oldLevel) audio.play('level'); oldLevel = p.level;
  for (const key of ['primary', 'skill1', 'skill2', 'dodge', 'potion']) { const cd = p.cooldowns?.[key] || 0; if (cd > (oldCooldowns[key] || 0) + .1) audio.play(key === 'primary' ? ({ warrior: 'swing', archer: 'arrow', wizard: 'spell' })[p.classId] : key === 'dodge' ? 'dodge' : key === 'potion' ? 'heal' : 'skill'); oldCooldowns[key] = cd; }
  const m = game.map, tx = Math.floor(p.x / m.tileSize), ty = Math.floor(p.y / m.tileSize);
  for (let dy = -7; dy <= 7; dy++) for (let dx = -7; dx <= 7; dx++) if (dx * dx + dy * dy <= 64 && tx + dx >= 0 && tx + dx < m.width && ty + dy >= 0 && ty + dy < m.height) explored.add((ty + dy) * m.width + tx + dx);
}

function updateHud() {
  if (!game || $('#hud').hidden) return; const p = me(); if (!p) return;
  setText('#hud-name', p.name); setText('#hud-level', 'LV ' + p.level); setText('#health-value', `${Math.ceil(Math.max(0, p.hp))} / ${p.maxHp}`); setText('#energy-value', `${Math.ceil(p.energy)} / ${p.maxEnergy}`);
  $('#health-fill').style.width = Math.max(0, p.hp / p.maxHp * 100) + '%'; $('#energy-fill').style.width = p.energy / p.maxEnergy * 100 + '%'; $('#xp-fill').style.width = Math.min(100, p.xp / p.xpNext * 100) + '%';
  setText('#bag-count', p.inventory.length); setText('#zone-label', `AREA ${game.zoneIndex + 1} OF 3 · ${game.zoneName}`);
  const boss = game.enemies.find(e => e.id === game.bossId), bossNear = boss && boss.hp > 0 && Math.hypot(boss.x - p.x, boss.y - p.y) < 650;
  setText('#objective-title', game.bossDefeated ? 'Decide the heart’s fate' : `Defeat ${Sim.ZONES[game.zoneIndex].boss}`);
  const detail = settings.guidance === 'expert' ? '' : bossNear ? 'Red ground means danger. Dodge before the strike.' : settings.guidance === 'simple' ? 'Follow the corridors. The red mark on your map is the boss.' : 'Find the far chamber.';
  setText('#objective-detail', detail); $('#heart-status').innerHTML = game.hearts.length ? `<span class="heart-pill">${game.corruption ? `${game.corruption} HEART${game.corruption > 1 ? 'S' : ''} CLAIMED · ` : ''}${game.hearts.filter(h => h.choice === 'cleanse').length ? `${game.hearts.filter(h => h.choice === 'cleanse').length} AT REST` : 'THE CURSE IS GROWING'}</span>` : '';
  $('#boss-hud').hidden = !bossNear; if (bossNear) { setText('#boss-name', boss.name || Sim.ZONES[game.zoneIndex].boss); setText('#boss-subtitle', Sim.ZONES[game.zoneIndex].bossTitle); $('#boss-fill').style.width = boss.hp / boss.maxHp * 100 + '%'; }
  const others = game.players.filter(q => q.id !== playerId), partySignature = others.map(q => [q.id, q.hp.toFixed(0), q.level, q.downed, q.connected].join()).join('|');
  if ($('#party-hud').dataset.signature !== partySignature) { $('#party-hud').dataset.signature = partySignature; $('#party-hud').innerHTML = others.map(q => `<div class="party-member" style="--class-color:${Sim.CLASSES[q.classId]?.color}"><div><span>${esc(q.name)}</span><small>${q.connected === false ? 'OFFLINE' : q.downed ? 'DOWN' : 'LV ' + q.level}</small></div><div class="bar"><i style="width:${Math.max(0, q.hp / q.maxHp * 100)}%"></i></div></div>`).join(''); }
  const c = Sim.CLASSES[p.classId];
  for (const b of $$('.ability')) { const key = b.dataset.input === 'attack' ? 'primary' : b.dataset.input, cd = p.cooldowns?.[key] || 0, max = c[key]?.cooldown || (key === 'dodge' ? 3.2 : 18); b.querySelector('i').style.height = Math.min(100, cd / max * 100) + '%'; b.querySelector('b').textContent = cd > .15 && key !== 'primary' ? Math.ceil(cd) : ''; b.classList.toggle('low-energy', (c[key]?.energyCost || 0) > p.energy); }
  for (const b of $$('[data-touch]')) { const key = b.dataset.touch === 'attack' ? 'primary' : b.dataset.touch, cd = p.cooldowns?.[key] || 0; if (b.querySelector('b')) b.querySelector('b').textContent = cd > .15 ? Math.ceil(cd) : ''; }
  $('#downed').hidden = !p.downed;
  const target = game.players.find(q => q.id !== playerId && q.downed && Math.hypot(q.x - p.x, q.y - p.y) < 80);
  const chest = game.map.chests?.find(o => !o.opened && Math.hypot(o.x - p.x, o.y - p.y) < 85), shrine = game.map.shrines?.find(o => !o.used && Math.hypot(o.x - p.x, o.y - p.y) < 85);
  const verb = coarse ? 'Hold the hand button' : 'Hold F';
  let hint = target ? `${verb} to revive ${target.name}${target.reviveProgress ? ' · ' + Math.round(target.reviveProgress * 100) + '%' : ''}` : chest ? `${coarse ? 'Tap the hand' : 'Press F'} to open the chest` : shrine ? `${coarse ? 'Tap the hand' : 'Press F'} for a healing blessing` : '';
  if (settings.guidance === 'expert' && !target) hint = '';
  $('#interaction-hint').hidden = !hint; setText('#interaction-hint', hint);
  $('#first-help').style.opacity = settings.guidance === 'simple' && performance.now() - startedAt < 40000 ? '1' : '0';
  setText('#net-label', mode === 'online' ? `${session?.code || 'PARTY'} · ${latency || '…'} ms` : 'SOLO · SAVES HERE');
  drawMap($('#minimap')); if (modalKind === 'map') drawMap($('#large-map'), true);
  if (modalKind === 'inventory' && lastModalSignature !== inventorySignature()) renderInventory();
}
function drawMap(canvas, large = false) {
  if (!canvas || !game?.map) return; const ctx = canvas.getContext('2d'), { width: w, height: h } = canvas, m = game.map;
  ctx.clearRect(0, 0, w, h); ctx.fillStyle = '#08100dbb'; ctx.fillRect(0, 0, w, h);
  const scale = Math.min((w - 16) / m.width, (h - 16) / m.height), ox = (w - m.width * scale) / 2, oy = (h - m.height * scale) / 2;
  for (let y = 0; y < m.height; y++) for (let x = 0; x < m.width; x++) { const i = y * m.width + x; if (m.tiles[i] && explored.has(i)) { ctx.fillStyle = '#5c6752'; ctx.fillRect(ox + x * scale, oy + y * scale, Math.ceil(scale), Math.ceil(scale)); } }
  function mark(x, y, color, radius, shape = 'circle') { ctx.fillStyle = color; ctx.beginPath(); const sx = ox + x / m.tileSize * scale, sy = oy + y / m.tileSize * scale; if (shape === 'diamond') { ctx.moveTo(sx, sy - radius); ctx.lineTo(sx + radius, sy); ctx.lineTo(sx, sy + radius); ctx.lineTo(sx - radius, sy); ctx.closePath(); } else ctx.arc(sx, sy, radius, 0, Math.PI * 2); ctx.fill(); }
  const boss = game.enemies.find(e => e.boss && e.hp > 0); if (boss && (settings.guidance === 'simple' || explored.has(Math.floor(boss.y / m.tileSize) * m.width + Math.floor(boss.x / m.tileSize)))) mark(boss.x, boss.y, '#db7252', large ? 6 : 3.5, 'diamond');
  for (const chest of m.chests || []) if (!chest.opened && explored.has(Math.floor(chest.y / m.tileSize) * m.width + Math.floor(chest.x / m.tileSize))) mark(chest.x, chest.y, '#c9ad62', large ? 4 : 2.5, 'diamond');
  for (const p of game.players) if (p.connected !== false) mark(p.x, p.y, p.downed ? '#df6f64' : p.id === playerId ? '#f2dda1' : '#7ec8d0', large ? 5 : 3);
}

function onlineRenderState() {
  if (!currentSnapshot || !previousSnapshot || !currentSnapshot.map) return game;
  if (currentSnapshot.zoneIndex !== previousSnapshot.zoneIndex || currentSnapshot.phase !== previousSnapshot.phase) return currentSnapshot;
  const t = clamp((performance.now() - snapshotAt) / 66.67, 0, 1);
  // Interpolate visual positions only; never alter authoritative health, inventory or collision state.
  renderState = { ...currentSnapshot };
  for (const key of ['players', 'enemies', 'projectiles']) {
    const previous = new Map((previousSnapshot[key] || []).map(e => [e.id, e]));
    renderState[key] = (currentSnapshot[key] || []).map(e => { const old = previous.get(e.id); if (!old || Math.hypot(e.x - old.x, e.y - old.y) > 250) return e; let angle = e.facing; if (Number.isFinite(angle) && Number.isFinite(old.facing)) { const delta = Math.atan2(Math.sin(angle - old.facing), Math.cos(angle - old.facing)); angle = old.facing + delta * t; } return { ...e, x: old.x + (e.x - old.x) * t, y: old.y + (e.y - old.y) * t, facing: angle }; });
  }
  return renderState;
}
function frame(now) {
  const dt = Math.min(.05, (now - frameAt) / 1000); frameAt = now;
  try {
    if (!game || $('#hud').hidden) renderer.drawMenuBackground(now / 1000);
    else {
      if (mode === 'solo' && !paused && game.phase === 'playing') {
        frameAccum += dt; Sim.setInput(game, playerId, makeInput()); let steps = 0;
        while (frameAccum >= 1 / 60 && steps++ < 4) { Sim.step(game, 1 / 60); frameAccum -= 1 / 60; }
        observeState();
      }
      if (mode === 'online' && lobby?.started && now - networkAt >= 33) { networkAt = now; send({ type: 'input', seq: ++seq, input: modalKind ? { mx: 0, my: 0, aimX: me()?.x || 0, aimY: me()?.y || 0 } : makeInput() }); }
      renderer.render(mode === 'online' ? onlineRenderState() : game, playerId, dt, { aim: pointer.active && !coarse ? renderer.screenToWorld(pointer.x, pointer.y) : null, showAim: !modalKind, shake: settings.shake, guidance: settings.guidance, reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches || !settings.shake });
      if (now - hudAt > 100) { hudAt = now; updateHud(); }
      if (now - saveAt > 5000) { saveAt = now; persistSolo(); if (mode === 'online') send({ type: 'ping', at: performance.now() }); }
    }
  } catch (error) { console.error(error); if (!frame.failed) { frame.failed = true; $('#fatal-error').hidden = false; $('#fatal-error').textContent = 'The game hit a rendering error. Your solo journey is saved when possible. Reload to try again. ' + error.message; persistSolo(); } }
  requestAnimationFrame(frame);
}

$$('.class-card').forEach(b => b.addEventListener('click', () => { audio.unlock(); audio.play('click'); selectClass(b.dataset.class); }));
$('#hero-name').value = settings.name; $('#difficulty').value = ['story', 'normal', 'hard'].includes(settings.difficulty) ? settings.difficulty : 'normal';
$('#hero-name').addEventListener('change', e => { settings.name = e.target.value; saveSettings(); }); $('#difficulty').addEventListener('change', e => { settings.difficulty = e.target.value; saveSettings(); });
$('#solo').addEventListener('click', () => { if (read(STORAGE.save, null)) showModal('new-confirm', 'A ROAD ALREADY WALKED', 'Begin a new journey?', '<p>Your current solo journey will be replaced. Your chronicle will stay.</p><div class="modal-actions"><button class="button primary" data-act="fresh-solo">Begin anew</button><button class="button" data-act="continue-solo">Continue saved journey</button></div>'); else startSolo(); });
$('#continue').addEventListener('click', () => startSolo(read(STORAGE.save, null)));
$('#host').addEventListener('click', () => connectParty('host'));
$('#join').addEventListener('click', () => { const code = $('#join-code').value.trim().toUpperCase().replace(/\s/g, ''); if (code.length !== 6) return status('Enter your friend’s six-character party code.'); connectParty('join', { code }); });
$('#join-code').addEventListener('input', e => { e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''); });
$('#join-code').addEventListener('keydown', e => { if (e.key === 'Enter') $('#join').click(); });
$('#guide-open').onclick = openGuide; $('#records-open').onclick = openRecords; $('#bag-open').onclick = openInventory; $('#map-open').onclick = openMap; $('#minimap').onclick = openMap; $('#pause-open').onclick = openPause;
$('#modal-close').onclick = () => closeModal(); $('#connection-back').onclick = goCamp;
$('#modal-backdrop').addEventListener('click', e => { if (e.target === $('#modal-backdrop')) closeModal(); });
$('#modal-body').addEventListener('click', async event => {
  const button = event.target.closest('[data-act]'); if (!button) return; audio.unlock(); audio.play('click'); const type = button.dataset.act;
  if (type === 'close') { if (game?.phase === 'choice') openChoice(); else closeModal(true); } else if (type === 'camp') goCamp(); else if (type === 'guide') openGuide(); else if (type === 'inventory') openInventory(); else if (type === 'item') showItem(button.dataset.item);
  else if (type === 'temper') { button.disabled = true; perform({ type: 'temper' }); openInventory(); }
  else if (['equip', 'salvage', 'drop'].includes(type)) { perform({ type, itemId: button.dataset.item }); openInventory(); }
  else if (type === 'start-party') { button.disabled = true; send({ type: 'start' }); }
  else if (type === 'claim' || type === 'cleanse') { button.disabled = true; perform({ type: 'choose', choice: type }); }
  else if (type === 'new-journey') { if (mode === 'solo') startSolo(); else { perform({ type: 'restart' }); currentPhase = ''; currentZone = -1; observedWorldKey = ''; knownItems.clear(); seenMessages.clear(); oldHp = null; oldLevel = 1; runRecorded = false; closeModal(true); } }
  else if (type === 'fresh-solo') startSolo(); else if (type === 'continue-solo') startSolo(read(STORAGE.save, null));
  else if (type === 'choice-equipment') openInventory();
  else if (type === 'copy-code' || type === 'copy-invite') {
    const code = session?.code || lobby?.code || '', text = type === 'copy-code' ? code : `${location.origin}${location.pathname}?party=${encodeURIComponent(code)}`;
    try { await navigator.clipboard.writeText(text); button.textContent = 'Copied'; } catch { button.textContent = code; status('Party code: ' + code, 10000); }
  }
});
$('#modal-body').addEventListener('change', event => {
  const el = event.target; if (el.id === 'guidance') settings.guidance = el.value; if (el.id === 'audio-enabled') settings.sound = el.checked; if (el.id === 'audio-volume') settings.volume = Number(el.value); if (el.id === 'shake-enabled') settings.shake = el.checked;
  saveSettings(); audio.unlock(); audio.set(settings.sound, settings.volume); syncSound(); updateHud();
});
$('#modal-body').addEventListener('input', event => { if (event.target.id === 'audio-volume') { settings.volume = Number(event.target.value); audio.set(settings.sound, settings.volume); } });
function syncSound() { $$('.sound-toggle').forEach(b => { b.classList.toggle('muted', !settings.sound); b.setAttribute('aria-label', settings.sound ? 'Mute sound' : 'Enable sound'); }); }
$$('.sound-toggle').forEach(b => b.onclick = () => { audio.unlock(); settings.sound = !settings.sound; audio.set(settings.sound, settings.volume); saveSettings(); syncSound(); audio.play('click'); });

window.addEventListener('keydown', event => {
  if (['INPUT', 'SELECT', 'TEXTAREA'].includes(event.target.tagName)) return;
  if (event.code === 'Escape') { if (modalKind) { if (game?.phase === 'choice') openChoice(); else closeModal(); } else if (game && !$('#hud').hidden) openPause(); return; }
  if (!game || $('#hud').hidden) return;
  if (event.code === 'KeyI' && !event.repeat) { if (modalKind === 'inventory') closeModal(); else if (!['choice', 'result', 'lobby'].includes(modalKind)) openInventory(); event.preventDefault(); return; }
  if (event.code === 'KeyM' && !event.repeat) { if (modalKind === 'map') closeModal(); else if (!['choice', 'result', 'lobby'].includes(modalKind)) openMap(); event.preventDefault(); return; }
  if (modalKind) return;
  const handled = ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'KeyQ', 'KeyE', 'KeyF', 'KeyR', 'KeyJ', 'KeyK', 'KeyL'];
  if (handled.includes(event.code)) { event.preventDefault(); keys.add(event.code); audio.unlock(); }
});
window.addEventListener('keyup', e => keys.delete(e.code));
window.addEventListener('blur', () => { resetInput(); if (mode === 'solo' && !modalKind && game?.phase === 'playing') openPause(); });
document.addEventListener('visibilitychange', () => { if (document.hidden) { resetInput(); persistSolo(); if (mode === 'solo' && !modalKind && game?.phase === 'playing') openPause(); } });
window.addEventListener('pagehide', persistSolo);
window.addEventListener('resize', () => renderer.resize());
$('#world').addEventListener('pointermove', e => { if (e.pointerType !== 'touch') { pointer.x = e.clientX; pointer.y = e.clientY; pointer.active = true; } });
$('#world').addEventListener('pointerdown', e => { if (!game || modalKind || e.pointerType === 'touch') return; audio.unlock(); pointer.x = e.clientX; pointer.y = e.clientY; pointer.active = true; if (e.button === 0) pointer.attack = true; if (e.button === 2) { held.skill1 = true; pulses.skill1 = performance.now() + 140; } $('#world').setPointerCapture(e.pointerId); });
window.addEventListener('pointerup', e => { if (e.pointerType !== 'touch') { if (e.button === 0) pointer.attack = false; if (e.button === 2) held.skill1 = false; } });
$('#world').addEventListener('contextmenu', e => e.preventDefault());
$('#world').addEventListener('pointercancel', resetInput);
for (const button of [...$$('.ability'), ...$$('[data-touch]')]) {
  const key = button.dataset.input || button.dataset.touch;
  button.addEventListener('pointerdown', event => { if (modalKind) return; event.preventDefault(); audio.unlock(); held[key] = true; pulses[key] = performance.now() + 150; button.classList.add('pressed'); button.setPointerCapture(event.pointerId); });
  for (const event of ['pointerup', 'pointercancel', 'lostpointercapture']) button.addEventListener(event, () => { held[key] = false; button.classList.remove('pressed'); });
}
const stick = $('#stick');
function moveStick(event) { const bounds = stick.getBoundingClientRect(), half = bounds.width / 2; let x = (event.clientX - bounds.left - half) / (half * .67), y = (event.clientY - bounds.top - half) / (half * .67), len = Math.hypot(x, y); if (len > 1) { x /= len; y /= len; } joystick.x = x; joystick.y = y; $('#stick-thumb').style.transform = `translate(${x * 36}px,${y * 36}px)`; }
stick.addEventListener('pointerdown', event => { if (modalKind) return; event.preventDefault(); audio.unlock(); joystick.pointerId = event.pointerId; stick.setPointerCapture(event.pointerId); moveStick(event); });
stick.addEventListener('pointermove', event => { if (event.pointerId === joystick.pointerId) { event.preventDefault(); moveStick(event); } });
for (const event of ['pointerup', 'pointercancel', 'lostpointercapture']) stick.addEventListener(event, () => { joystick.pointerId = null; joystick.x = joystick.y = 0; $('#stick-thumb').style.transform = ''; });

selectClass(selectedClass); syncSound(); refreshContinue(); renderer.resize(); requestAnimationFrame(frame);
const invite = new URL(location.href).searchParams.get('party'); if (invite) { $('#join-code').value = invite.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6); status('Choose your class, then tap Join friends.', 9000); }
const savedSession = read(STORAGE.session, null, sessionStorage);
if (savedSession?.code && savedSession?.token && !invite) { status('You have a recent party. Trying to reconnect…', 0); connectParty('resume', savedSession); }
