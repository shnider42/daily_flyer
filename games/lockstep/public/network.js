import { VERSION } from './world.mjs';

const PROTOCOL = 1;
const STORAGE_KEY = 'lockstep.coop.session.v1';
const CODE = /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$/;
const fatalCodes = new Set(['VERSION_MISMATCH', 'ROOM_NOT_FOUND', 'ROOM_FULL', 'ROOM_CAPACITY', 'INVALID_TOKEN', 'ROOM_EXPIRED', 'SERVER_RESTART']);
const noop = () => {};

/** Room-scene co-op: immediate local viewing, authoritative shared interactions. */
export class CoopClient {
  constructor({ onState = noop, onStatus = noop, onRoster = noop, onMessage = noop } = {}) {
    this.callbacks = { onState, onStatus, onRoster, onMessage };
    this.socket = null;
    this._session = null;
    this._active = false;
    this._connected = false;
    this._intent = null;
    this._room = '';
    this._revision = -1;
    this._pending = new Map();
    this._counter = 0;
    this._attempts = 0;
    this._retryTimer = null;
    this._helloTimer = null;
    this._heartbeat = null;
    this._lastPacket = 0;
    this._clockOffset = 0;
    this._latency = 0;
    try {
      const saved = JSON.parse(sessionStorage.getItem(STORAGE_KEY));
      if (saved && CODE.test(saved.code) && typeof saved.token === 'string') this._session = saved;
    } catch { /* Private browsing can disable storage. */ }
    this._visibility = () => {
      if (!this._active || document.hidden) return;
      if (!this._connected || Date.now() - this._lastPacket > 12_000) this.reconnect();
      else this._send({ type: 'ping', at: Date.now() });
    };
    this._online = () => { if (this._active && !this._connected) this.reconnect(); };
    document.addEventListener('visibilitychange', this._visibility);
    window.addEventListener('online', this._online);
  }

  get roomCode() { return this._session?.code || this._intent?.code || ''; }
  get playerId() { return this._session?.id || ''; }
  get connected() { return this._connected; }
  get serverNow() { return Date.now() + this._clockOffset; }
  get latency() { return this._latency; }
  get resumeInfo() { return this._session ? { code: this._session.code, name: this._session.name } : null; }

  _emit(name, ...args) {
    try { this.callbacks[name](...args); }
    catch (error) { console.error('LOCKSTEP interface callback failed', error); }
  }
  _status(status, detail = '') { this._emit('onStatus', status, detail); }
  _store() {
    try {
      if (this._session) sessionStorage.setItem(STORAGE_KEY, JSON.stringify(this._session));
      else sessionStorage.removeItem(STORAGE_KEY);
    } catch { /* The live room still works when storage is unavailable. */ }
  }
  _clearTimers() {
    clearTimeout(this._retryTimer); clearTimeout(this._helloTimer); clearInterval(this._heartbeat);
    this._retryTimer = this._helloTimer = this._heartbeat = null;
  }
  _dropSocket(sendLeave = false) {
    const socket = this.socket;
    this.socket = null; this._connected = false;
    this._clearTimers();
    if (!socket) return;
    socket.onopen = socket.onmessage = socket.onerror = socket.onclose = null;
    if (sendLeave && socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: 'leave' }));
    try { socket.close(1000, sendLeave ? 'Left team' : 'Reconnecting'); } catch { /* Already closed. */ }
  }
  _name(name) { return String(name || 'Inmate').replace(/[\u0000-\u001f\u007f<>]/g, '').trim().slice(0, 20) || 'Inmate'; }

  create(name = 'Inmate') {
    this._dropSocket(true); this._session = null; this._store();
    this._pending.clear(); this._revision = -1; this._attempts = 0;
    this._intent = { create: true, name: this._name(name) };
    this._active = true; this._open();
    return true;
  }

  join(code, name = 'Inmate') {
    code = String(code || '').replace(/[\s-]/g, '').toUpperCase();
    if (!CODE.test(code)) {
      this._status('error', 'Enter the six-character team code from your friend.');
      return false;
    }
    const resume = this._session?.code === code ? this._session : null;
    this._dropSocket(!resume);
    this._pending.clear(); this._revision = -1; this._attempts = 0;
    this._session = resume; this._store();
    this._intent = { create: false, code, name: this._name(name), ...(resume ? { token: resume.token } : {}) };
    this._active = true; this._open();
    return true;
  }

  reconnect() {
    if (this._session) {
      this._intent = { create: false, code: this._session.code, token: this._session.token, name: this._session.name };
    }
    if (!this._intent) { this._status('error', 'Create or join a team first.'); return false; }
    this._active = true; this._dropSocket(); this._open(); return true;
  }

  _schedule() {
    if (!this._active) return;
    this._connected = false;
    if (document.hidden) { this._status('disconnected', 'Return to the game to rejoin your team.'); return; }
    const delay = Math.min(5000, 500 * 2 ** Math.min(this._attempts++, 4));
    this._status('reconnecting', 'Connection interrupted. Rejoining your team…');
    clearTimeout(this._retryTimer);
    this._retryTimer = setTimeout(() => this._open(), delay);
  }

  _open() {
    if (!this._active || !this._intent) return;
    this._dropSocket();
    this._status(this._session ? 'reconnecting' : 'connecting', this._session ? 'Rejoining your team…' : 'Opening a team connection…');
    const url = new URL('/ws', location.href);
    url.protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    let socket;
    try { socket = new WebSocket(url.href); }
    catch { this._schedule(); return; }
    this.socket = socket;
    let welcomed = false;
    this._helloTimer = setTimeout(() => {
      if (this.socket !== socket || welcomed) return;
      this._status('reconnecting', 'The service is waking up. Retrying your connection…');
      this._dropSocket(); this._schedule();
    }, 20_000);
    socket.onopen = () => {
      if (this.socket !== socket) return;
      this._send({ type: 'hello', protocol: PROTOCOL, version: VERSION, ...this._intent });
    };
    socket.onmessage = event => {
      if (this.socket !== socket) return;
      let packet;
      try { packet = JSON.parse(event.data); } catch { return; }
      if (!packet || typeof packet !== 'object') return;
      this._lastPacket = Date.now();
      if (packet.type === 'welcome') {
        welcomed = true; clearTimeout(this._helloTimer);
        this._session = { code: packet.roomCode, id: packet.playerId, token: packet.token, name: packet.name };
        this._intent = { create: false, code: packet.roomCode, token: packet.token, name: packet.name };
        this._store(); this._connected = true; this._attempts = 0;
        this._revision = packet.revision;
        if (Number.isFinite(packet.serverTime)) this._clockOffset = packet.serverTime - Date.now();
        this._status('connected', 'Team ' + packet.roomCode);
        this._emit('onRoster', packet.roster || []);
        this._emit('onState', packet.state, { revision: packet.revision, serverTime: packet.serverTime, initial: true });
        if (this._room) this._send({ type: 'presence', room: this._room });
        for (const message of this._pending.values()) this._send(message);
        this._send({ type: 'ping', at: Date.now() });
        this._heartbeat = setInterval(() => {
          if (!this._active || document.hidden) return;
          if (Date.now() - this._lastPacket > 12_000) { this.reconnect(); return; }
          this._send({ type: 'ping', at: Date.now() });
        }, 4000);
        return;
      }
      if (packet.type === 'state') {
        if (packet.roomCode !== this.roomCode || packet.revision < this._revision) return;
        this._revision = packet.revision;
        this._emit('onState', packet.state, {
          revision: packet.revision, serverTime: packet.serverTime, actorId: packet.actorId,
          event: packet.event, message: packet.message, initial: false,
        });
        return;
      }
      if (packet.type === 'roster') {
        if (packet.roomCode === this.roomCode) this._emit('onRoster', packet.roster || []);
        return;
      }
      if (packet.type === 'pong') {
        const received = Date.now();
        if (Number.isFinite(packet.at) && Number.isFinite(packet.serverTime)) {
          this._latency = Math.max(0, Math.round(received - packet.at));
          this._clockOffset = packet.serverTime - (packet.at + received) / 2;
        }
        return;
      }
      if (packet.type === 'action-result') {
        this._pending.delete(packet.actionId); this._emit('onMessage', packet); return;
      }
      if (packet.type === 'error') {
        this._emit('onMessage', packet);
        if (fatalCodes.has(packet.code)) {
          this._active = false; this._dropSocket(); this._pending.clear();
          if (['ROOM_NOT_FOUND', 'INVALID_TOKEN', 'ROOM_EXPIRED', 'SERVER_RESTART'].includes(packet.code)) {
            this._session = null; this._store();
          }
          this._status('error', packet.message || 'Could not join the team.');
        }
      }
    };
    socket.onerror = () => { /* onclose owns the retry, avoiding parallel connections. */ };
    socket.onclose = event => {
      if (this.socket !== socket) return;
      this._connected = false; this._clearTimers(); this.socket = null;
      if (event.code === 4001) {
        this._active = false;
        this._status('disconnected', 'Your place is open in another tab. Reconnect here to switch back.');
        return;
      }
      if (this._active) this._schedule();
    };
  }

  _send(packet) {
    const socket = this.socket;
    if (!socket || socket.readyState !== WebSocket.OPEN || socket.bufferedAmount > 32_768) return false;
    try { socket.send(JSON.stringify(packet)); return true; } catch { return false; }
  }

  sendAction(action) {
    if (!this._connected) {
      this._emit('onMessage', { type: 'notice', message: 'Reconnecting. Your team’s progress is safe on the server.' });
      return false;
    }
    if (this._pending.size >= 32) {
      this._emit('onMessage', { type: 'notice', message: 'Waiting for the team connection to catch up…' });
      return false;
    }
    const actionId = globalThis.crypto?.randomUUID?.() || `${Date.now().toString(36)}-${++this._counter}`;
    const packet = { type: 'action', actionId, action: structuredClone(action) };
    if (!this._send(packet)) {
      this._emit('onMessage', { type: 'notice', message: 'The connection is busy. Try that interaction again.' });
      return false;
    }
    this._pending.set(actionId, packet);
    return true;
  }

  presence(roomId) {
    if (typeof roomId !== 'string' || !/^[a-zA-Z0-9_-]{1,48}$/.test(roomId)) return false;
    this._room = roomId;
    return this._connected && this._send({ type: 'presence', room: roomId });
  }

  leave() {
    this._active = false; this._dropSocket(true); this._pending.clear();
    this._session = null; this._intent = null; this._revision = -1; this._room = ''; this._store();
    this._emit('onRoster', []); this._status('disconnected', 'Left the team.');
  }

  destroy() {
    this.leave();
    document.removeEventListener('visibilitychange', this._visibility);
    window.removeEventListener('online', this._online);
  }
}
