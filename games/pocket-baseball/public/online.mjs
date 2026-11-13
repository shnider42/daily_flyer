/** Private-room transport. UI, drawing and sound stay in app.mjs. */
import { BaseballGame } from './engine.mjs?v=0.5.0';

const STORAGE_KEY = 'dfe.baseball.online.v1';
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
const clock = () => typeof performance !== 'undefined' ? performance.now() : Date.now();
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const phaseKey = s => `${s.phase}:${s.phaseStartedAt}:${s.inning}:${s.half}:${s.nextPitchId}`;
const pitchId = s => s.phase === 'ready' ? s.nextPitchId : (s.pitch?.id ?? s.nextPitchId);
const GAME_INPUTS = new Set(['pitch', 'swing', 'throw', 'run', 'lead', 'steal', 'pickoff', 'changePitcher']);
const clone = value => value === undefined ? undefined : JSON.parse(JSON.stringify(value));
const AUTHORITY_FIELDS = ['score', 'hits', 'hitByPitches', 'lineScore', 'outs', 'balls', 'strikes', 'bases', 'batterIndex', 'pitching', 'practice', 'result', 'pending', 'lastContact'];
function storage() { try { return typeof sessionStorage !== 'undefined' ? sessionStorage : null; } catch { return null; } }
function savedSession(baseUrl) {
  try { const value = JSON.parse(storage()?.getItem(STORAGE_KEY) || 'null'); return value && (!baseUrl || value.baseUrl === baseUrl.replace(/\/$/, '')) ? value : null; } catch { return null; }
}

export class OnlineSession {
  constructor({ baseUrl = '', onChange = () => {}, onError = () => {}, onEvent = () => {}, fetchImpl = globalThis.fetch, storageEnabled = true } = {}) {
    this.baseUrl = baseUrl.replace(/\/$/, ''); this.onChange = onChange; this.onError = onError; this.onEvent = onEvent;
    // Native browser fetch requires Window as its receiver. Keeping an unbound
    // method on this session makes Chromium/Safari throw "Illegal invocation".
    this.fetch = (...args) => fetchImpl.call(globalThis, ...args); this.storageEnabled = storageEnabled;
    this.game = new BaseballGame({ humanSides: [0, 1], inputWindow: .2 });
    this.code = null; this.side = null; this.generation = null; this.token = null; this.room = null;
    this.connected = false; this.connecting = false; this.latencyMs = null; this.error = null;
    this.sequence = 0; this._queue = Promise.resolve(); this._streamAbort = null; this._closed = true;
    this._lastPacketAt = 0; this._authoritativeTime = 0; this._eventCursor = null; this._revision = -1;
    this._clockOffset = 0; this._clockKnown = false; this._reconnectTask = null; this._generationCounter = 0;
    this._viewLead = 0; this._predictionSwing = null; this._lifecycleAbort = null;
    this._authority = null;
    this._cancelCleanup = new Map();
  }
  static hasSavedSession(baseUrl) { return !!savedSession(baseUrl); }
  get hasSavedSession() { return OnlineSession.hasSavedSession(this.baseUrl); }
  get waitingForOpponent() { return !!this.room && this.room.readySides.includes(this.side); }
  get isOnline() { return !this._closed && !!this.code; }
  _changed() { try { this.onChange(this); } catch {} }
  _error(error) {
    this.error = error instanceof Error ? error : new Error(String(error));
    try { this.onError(this.error); } catch {} this._changed();
  }
  async _request(path, data = {}, { auth = true, token = this.token, signal, timeout = 20000 } = {}) {
    const controller = new AbortController(), timer = setTimeout(() => controller.abort(), timeout);
    const abort = () => controller.abort(); signal?.addEventListener('abort', abort, { once: true });
    const headers = { 'Content-Type': 'application/json' };
    if (auth && token) headers.Authorization = `Bearer ${token}`;
    try {
      const response = await this.fetch(`${this.baseUrl}${path}`, { method: 'POST', headers, body: JSON.stringify(data), signal: controller.signal, cache: 'no-store', credentials: 'omit', referrerPolicy: 'no-referrer' });
      let value;
      try { value = await response.json(); } catch { throw new Error('The online field returned an unreadable response.'); }
      if (!response.ok) { const error = new Error(value.error || 'The online field could not be reached.'); error.code = value.code; error.status = response.status; throw error; }
      return value;
    } finally { clearTimeout(timer); signal?.removeEventListener('abort', abort); }
  }
  async create(options = {}) {
    await this._reset(); this.connecting = true; this._changed();
    const generation = this._generationCounter, controller = new AbortController(); this._lifecycleAbort = controller;
    try { return await this._adopt(await this._request('/api/rooms', options, { auth: false, timeout: 90000, signal: controller.signal }), generation); }
    catch (error) { if (generation !== this._generationCounter) throw this._cancelled(); this.connecting = false; this._error(error); throw error; }
    finally { if (this._lifecycleAbort === controller) this._lifecycleAbort = null; }
  }
  async join(code, options = {}) {
    await this._reset(); this.connecting = true; this._changed();
    const normalized = String(code || '').trim().toUpperCase();
    if (!/^[A-Z2-9]{6}$/.test(normalized)) { const error = new Error('Enter the six-character room code.'); this.connecting = false; this._error(error); throw error; }
    const generation = this._generationCounter, controller = new AbortController(); this._lifecycleAbort = controller;
    try { return await this._adopt(await this._request(`/api/rooms/${normalized}/join`, options, { auth: false, timeout: 90000, signal: controller.signal }), generation); }
    catch (error) { if (generation !== this._generationCounter) throw this._cancelled(); this.connecting = false; this._error(error); throw error; }
    finally { if (this._lifecycleAbort === controller) this._lifecycleAbort = null; }
  }
  async rejoin() {
    const saved = savedSession(this.baseUrl);
    if (!saved) throw new Error('There is no saved seat in this tab. Join with a room code.');
    await this._reset(); this.token = saved.token; this.code = saved.code; this.connecting = true; this._changed();
    const generation = this._generationCounter, controller = new AbortController(); this._lifecycleAbort = controller;
    try { return await this._adopt(await this._request(`/api/rooms/${this.code}/rejoin`, {}, { signal: controller.signal }), generation); }
    catch (error) { if (generation !== this._generationCounter) throw this._cancelled(); this.connecting = false; if ([401, 404, 410].includes(error.status)) this._forget(); this._error(error); throw error; }
    finally { if (this._lifecycleAbort === controller) this._lifecycleAbort = null; }
  }
  _cancelled() { const error = new Error('The online connection was cancelled.'); error.code = 'cancelled'; return error; }
  async _discardSeat(value) {
    if (!value?.code || !value.token || !value.generation) return;
    try { await this._request(`/api/rooms/${value.code}/input`, { generation: value.generation, seq: (value.lastSeq || 0) + 1, command: { type: 'leave' } }, { token: value.token, timeout: 2500 }); } catch {}
  }
  async _adopt(value, generation = this._generationCounter) {
    if (generation !== this._generationCounter) { if (this._cancelCleanup.get(generation) !== false) await this._discardSeat(value); throw this._cancelled(); }
    this.code = value.code; this.side = value.side; this.token = value.token; this.generation = value.generation;
    this.sequence = value.lastSeq || 0; this._closed = false; this.error = null; this.connecting = true;
    this._eventCursor = null; this._revision = -1; this._clockKnown = false; this._predictionSwing = null;
    if (this.storageEnabled) try { storage()?.setItem(STORAGE_KEY, JSON.stringify({ baseUrl: this.baseUrl, code: this.code, token: this.token })); } catch {}
    if (value.packet) this._packet(value.packet);
    await this._openStream();
    if (generation !== this._generationCounter) throw this._cancelled();
    this._changed(); return this;
  }
  async _reset({ discardPendingSeat = true } = {}) {
    this._cancelCleanup.set(this._generationCounter, discardPendingSeat);
    if (this._cancelCleanup.size > 16) this._cancelCleanup.delete(this._cancelCleanup.keys().next().value);
    this._closed = true; this._generationCounter++; this._streamAbort?.abort(); this._streamAbort = null;
    this._lifecycleAbort?.abort(); this._lifecycleAbort = null;
    this.connected = false; this.connecting = false; this._queue = Promise.resolve();
    this.code = null; this.token = null; this.room = null; this.sequence = 0;
  }
  _forget() { if (this.storageEnabled) try { storage()?.removeItem(STORAGE_KEY); } catch {} }
  async _openStream() {
    const generation = this._generationCounter, controller = new AbortController(); this._streamAbort?.abort(); this._streamAbort = controller;
    const handshakeTimeout = setTimeout(() => controller.abort(), 10000);
    let response;
    try { response = await this.fetch(`${this.baseUrl}/api/rooms/${this.code}/stream`, { headers: { Authorization: `Bearer ${this.token}` }, signal: controller.signal, cache: 'no-store', credentials: 'omit', referrerPolicy: 'no-referrer' }); }
    finally { clearTimeout(handshakeTimeout); }
    if (!response.ok || !response.body) { const error = new Error('The room connection could not open. Try rejoining.'); error.status = response.status; throw error; }
    if (this._closed || generation !== this._generationCounter) { controller.abort(); return; }
    this.connected = true; this.connecting = false; this._lastPacketAt = clock(); this.error = null; this._changed();
    this._readStream(response.body, generation, controller).catch(error => {
      if (this._closed || generation !== this._generationCounter || controller !== this._streamAbort) return;
      this.connected = false; this.connecting = true; this.error = new Error('Connection lost. The game will pause while reconnecting.'); this._changed();
      this._reconnect();
    });
  }
  async _readStream(body, generation, controller) {
    const reader = body.getReader(), decoder = new TextDecoder(); let pending = '';
    try {
      while (!this._closed && generation === this._generationCounter) {
        const { value, done } = await reader.read(); if (done) throw new Error('Connection closed');
        pending += decoder.decode(value, { stream: true });
        if (pending.length > 2 * 1024 * 1024) throw new Error('Oversized connection packet');
        let split;
        while ((split = pending.indexOf('\n\n')) >= 0) {
          const event = pending.slice(0, split); pending = pending.slice(split + 2);
          const data = event.split('\n').filter(line => line.startsWith('data: ')).map(line => line.slice(6)).join('\n');
          if (!data) continue;
          let packet; try { packet = JSON.parse(data); } catch { continue; }
          if (packet.type === 'state') this._packet(packet);
          else if (packet.type === 'ping') this._pong(packet);
          else if (packet.type === 'closed' || packet.type === 'replaced') {
            this._closed = true; this.connected = false; this.connecting = false;
            if (packet.type === 'closed') this._forget();
            if (this.room) this.room = { ...this.room, status: 'closed', reason: packet.reason };
            this._error(new Error(packet.reason || 'The room closed.')); controller.abort(); return;
          }
        }
      }
    } finally { try { await reader.cancel(); } catch {} }
  }
  async _pong(packet) {
    if (this._closed) return;
    const start = clock(), wallStart = Date.now();
    try {
      const result = await this._request(`/api/rooms/${this.code}/pong`, { challenge: packet.challenge }, { timeout: 4500 });
      const rtt = clock() - start;
      // The response's server timestamp anchors the client clock; the server separately
      // measures a full challenge round trip and caps any accepted input rewind.
      const estimate = result.serverTime - (wallStart + rtt / 2);
      this._clockOffset = this._clockKnown ? this._clockOffset * .8 + estimate * .2 : estimate;
      this._clockKnown = true; this.latencyMs = result.latencyMs; this._changed();
    } catch { /* A missing heartbeat is handled by the stream/reconnect path. */ }
  }
  _packet(packet) {
    if (packet.room?.generation !== this.generation || !packet.snapshot || packet.revision < this._revision) return;
    const pendingEvents = this.game.drainEvents();
    this.game.restore(packet.snapshot); this.game.options.localSide = this.side; this.game.state.options.localSide = this.side;
    this._authority = packet.snapshot.state;
    this._authoritativeTime = this.game.state.time; this._lastPacketAt = clock(); this._revision = packet.revision;
    this.sequence = Math.max(this.sequence, Number.isSafeInteger(packet.ack) ? packet.ack : 0);
    this.room = packet.room; this.latencyMs = packet.latencyMs ?? this.latencyMs;
    this._viewLead = this.room.status === 'playing' && this._clockKnown ? clamp((Date.now() + this._clockOffset - packet.sentAt) / 1000, 0, .15) : 0;
    if (this._viewLead > 0) this._predict(this._viewLead);
    this.game.drainEvents(); // Prediction never publishes scoring or sound events.
    const newEvents = this._eventCursor === null ? [] : (packet.events || []).filter(event => event.eventId > this._eventCursor);
    this._eventCursor = Math.max(this._eventCursor || 0, packet.eventCursor || 0);
    this.game._events.push(...pendingEvents, ...newEvents);
    for (const event of newEvents) { try { this.onEvent(event); } catch {} }
    this._showPredictedSwing();
    this._changed();
  }
  _showPredictedSwing() {
    const swing = this._predictionSwing, s = this.game.state;
    if (swing && !this._authority?.swing && s.pitch?.id === swing.pitchId && ['windup', 'pitch'].includes(s.phase) && s.time - swing.time <= .225) {
      // Pose preview only. _predict temporarily removes this unconfirmed swing so
      // it cannot generate a hit, strike, runner, or scoring decision locally.
      s.swing = { time: swing.time, power: !!swing.power, aim: { ...swing.aim } };
    } else this._predictionSwing = null;
  }
  _predict(dt) {
    if (!this._authority || dt <= 0) return;
    const events = this.game.drainEvents(), before = this.game.snapshot(), authority = this._authority;
    if (this._predictionSwing && !authority.swing) this.game.state.swing = null;
    this.game.update(dt);
    const phase = this.game.state.phase;
    // Windup can visually release the ball; only the authority starts or ends a play.
    if (phase !== authority.phase && !(authority.phase === 'windup' && phase === 'pitch')) this.game.restore(before);
    for (const field of AUTHORITY_FIELDS) this.game.state[field] = clone(authority[field]);
    for (const runner of this.game.state.runners || []) {
      const known = (authority.runners || []).find(item => item.id === runner.id);
      if (known) { runner.out = known.out; runner.scored = known.scored; }
    }
    this.game.drainEvents(); this.game._events.push(...events); this._showPredictedSwing();
  }
  update(dt) {
    if (!this.isOnline || !this.connected || this.room?.status !== 'playing') return;
    const age = Math.max(0, (clock() - this._lastPacketAt) / 1000);
    if (age > .8) {
      this.connected = false; this.connecting = true; this._streamAbort?.abort(); this._changed(); this._reconnect(); return;
    }
    // Extrapolation is bounded. A delayed or lost stream cannot run an entire game locally.
    const maximum = this._authoritativeTime + Math.min(.2, this._viewLead + age);
    const advance = Math.min(Math.max(0, dt), Math.max(0, maximum - this.game.state.time));
    if (advance > 0) this._predict(advance);
  }
  command(input) {
    if (this._closed || !this.connected) { this._error(new Error('Wait for the room connection before playing.')); return false; }
    if (this.room?.status !== 'playing' && !['ready', 'pause', 'resume', 'leave'].includes(input.type) && !(input.type === 'changePitcher' && this.room?.status === 'paused')) return false;
    this.send(input).catch(error => this._error(error));
    return true;
  }
  send(input) {
    if (this._closed || !this.code) return Promise.reject(new Error('Join an online field first.'));
    const generation = this._generationCounter;
    const command = { ...input };
    if (GAME_INPUTS.has(command.type)) command.pitchId ??= pitchId(this.game.state);
    if (command.type === 'swing') {
      command.time = Number.isFinite(command.time) ? command.time : this.game.state.time;
      this._predictionSwing = { ...command, side: this.side };
      this._showPredictedSwing();
    }
    const playKey = phaseKey(this.game.state);
    const job = async () => {
      if (this._closed || generation !== this._generationCounter) throw new Error('That room has closed.');
      const seq = this.sequence + 1, envelope = { generation: this.generation, seq, phaseKey: playKey, command };
      let result, lastError;
      for (let attempt = 0; attempt < 3; attempt++) {
        try { result = await this._request(`/api/rooms/${this.code}/input`, envelope, { timeout: 5000 }); break; }
        catch (error) {
          lastError = error; if (error.status && error.status < 500 && error.status !== 429) throw error;
          if (attempt < 2) await wait(200 * (attempt + 1));
        }
      }
      if (!result) {
        if (generation !== this._generationCounter) throw lastError || new Error('That room has closed.');
        this._predictionSwing = null; this.connected = false; this.connecting = true; this._streamAbort?.abort(); this._reconnect();
        throw lastError || new Error('The input could not reach the field.');
      }
      if (generation !== this._generationCounter) return result;
      this.sequence = Math.max(this.sequence, seq);
      if (command.type === 'swing') this._predictionSwing = null;
      if (!result.ok) { const error = new Error(result.error || 'That action is unavailable.'); error.code = result.code; this._error(error); }
      return result;
    };
    const result = this._queue.then(job); this._queue = result.catch(() => {}); return result;
  }
  ready() { return this.send({ type: 'ready' }); }
  pause() { return this.send({ type: 'pause' }); }
  resume() { return this.send({ type: 'resume' }); }
  async disconnect() {
    // Abandon this connection attempt without ending the shared match or erasing
    // the saved seat. Use this after a temporary handshake/rejoin failure.
    await this._reset({ discardPendingSeat: false }); this._changed();
  }
  dispose() { return this.disconnect(); }
  async leave() {
    if (!this._closed && this.token) {
      try { await this.send({ type: 'leave' }); } catch {}
    }
    this._forget(); await this._reset(); this._changed();
  }
  async _reconnect() {
    if (this._closed || this._reconnectTask) return;
    const generation = this._generationCounter, started = clock();
    this._reconnectTask = (async () => {
      let attempt = 0;
      while (!this._closed && generation === this._generationCounter && clock() - started < 110000) {
        try {
          const value = await this._request(`/api/rooms/${this.code}/rejoin`, {}, { timeout: 6000 });
          this.sequence = Math.max(this.sequence, value.lastSeq || 0);
          if (value.packet) this._packet(value.packet);
          await this._openStream(); this.error = null; this._changed(); return;
        } catch (error) {
          if ([401, 404, 410].includes(error.status)) { this._closed = true; this.connecting = false; this._forget(); this._error(error); return; }
        }
        await wait(Math.min(5000, 600 * 2 ** Math.min(attempt++, 3)));
      }
      if (!this._closed && generation === this._generationCounter) { this.connecting = false; this._error(new Error('The connection could not recover. Rejoin or create a new room.')); }
    })().finally(() => { this._reconnectTask = null; });
    return this._reconnectTask;
  }
}
