const service = 'https://dfe-sunday-matches.onrender.com';
const staticHost = 'dfe-sunday-broadcast.onrender.com';
const storageKey = 'dfe.sunday-broadcast.room.v1';
const roomCode = /^[A-Z2-9]{6}$/;
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

function savedSeat(baseUrl) {
  try {
    const value = JSON.parse(sessionStorage.getItem(storageKey));
    return value?.baseUrl === baseUrl ? value : null;
  } catch { return null; }
}

export class OnlineMatch {
  constructor({
    baseUrl = globalThis.location?.hostname === staticHost ? service : '',
    fetchImpl = globalThis.fetch,
    onState = () => {},
    onStatus = () => {},
    onError = () => {},
  } = {}) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.fetch = (...args) => fetchImpl.call(globalThis, ...args);
    Object.assign(this, { onState, onStatus, onError });
    this.code = null;
    this.token = null;
    this.side = null;
    this.phase = null;
    this.room = null;
    this.connected = false;
    this.connecting = false;
    this.epoch = 0;
    this.seq = 0;
    this.lastMove = null;
    this.lastMoveAt = 0;
    this.movesInFlight = 0;
    this.queue = Promise.resolve();
  }

  get hasSavedSession() { return Boolean(savedSeat(this.baseUrl)); }

  saveSeat() {
    try { sessionStorage.setItem(storageKey, JSON.stringify({ baseUrl: this.baseUrl, code: this.code, token: this.token })); } catch {}
  }

  forgetSeat() {
    try { sessionStorage.removeItem(storageKey); } catch {}
  }

  async request(route, { payload, token = this.token, signal, timeout = 8000, retry = 0 } = {}) {
    const headers = {};
    if (token) headers.Authorization = 'Bearer ' + token;
    const controller = new AbortController();
    const abort = () => controller.abort();
    if (signal?.aborted) abort();
    else signal?.addEventListener('abort', abort, { once: true });
    const deadline = setTimeout(abort, timeout);
    if (payload) headers['Content-Type'] = 'application/json';
    try {
      const response = await this.fetch(this.baseUrl + route, {
        method: payload ? 'POST' : 'GET',
        headers,
        body: payload && JSON.stringify(payload),
        signal: controller.signal,
        credentials: 'omit',
        cache: 'no-store',
      });
      if (!response.ok) {
        const edgeMissing = response.status === 404 && !response.headers.get('content-type')?.includes('application/json');
        if (edgeMissing && retry > 0) {
          await response.body?.cancel().catch(() => {});
          await wait(200 * (3 - retry));
          return this.request(route, { payload, token, signal, timeout, retry: retry - 1 });
        }
        const value = await response.json().catch(() => ({}));
        const error = new Error(value.error || 'The online field could not be reached.');
        error.status = edgeMissing ? 503 : response.status;
        throw error;
      }
      return await response.json();
    } finally {
      clearTimeout(deadline);
      signal?.removeEventListener('abort', abort);
    }
  }

  async open(route, payload = {}, token = null) {
    if (this.code || this.connecting) throw new Error('Close the current room before joining another.');
    const epoch = ++this.epoch, abort = new AbortController();
    this.lifecycle = abort;
    this.connecting = true;
    this.onStatus('Connecting to the online field…');
    try {
      const seat = await this.request(route, { payload, token, signal: abort.signal, timeout: 90000, retry: 2 });
      if (epoch !== this.epoch) return this;
      Object.assign(this, { code: seat.code, token: seat.token, side: seat.side, seq: seat.lastSeq ?? 0 });
      this.saveSeat();
      this.receive(seat.packet);
      this.run(epoch);
      return this;
    } catch (error) {
      if (epoch !== this.epoch) return this;
      this.connecting = false;
      if (token && [401, 404].includes(error.status)) this.forgetSeat();
      this.onError(error);
      throw error;
    }
  }

  create(options = {}) { return this.open('/api/rooms', options); }

  join(code) {
    code = String(code || '').trim().toUpperCase();
    if (!roomCode.test(code)) return Promise.reject(new Error('Enter the six-character room code.'));
    return this.open('/api/rooms/' + code + '/join');
  }

  rejoin() {
    const seat = savedSeat(this.baseUrl);
    if (!seat) return Promise.reject(new Error('There is no saved match in this tab.'));
    return this.open('/api/rooms/' + seat.code + '/rejoin', {}, seat.token);
  }

  receive(packet) {
    if (!packet.room || !packet.game) return;
    this.room = packet.room;
    if (this.phase !== packet.room.phase) this.lastMove = null;
    this.phase = packet.room.phase;
    this.onState(packet);
  }

  async read(epoch, controller) {
    const timeout = setTimeout(() => controller.abort(), 12000);
    let response;
    try {
      response = await this.fetch(this.baseUrl + '/api/rooms/' + this.code + '/stream', {
        headers: { Authorization: 'Bearer ' + this.token },
        signal: controller.signal,
        credentials: 'omit',
        cache: 'no-store',
      });
    } finally { clearTimeout(timeout); }
    if (epoch !== this.epoch) return;
    if (!response.ok || !response.body) {
      const error = new Error('The room connection could not open.');
      error.status = response.status === 404 && !response.headers.get('content-type')?.includes('application/json') ? 503 : response.status;
      throw error;
    }
    const reader = response.body.getReader(), decoder = new TextDecoder();
    let pending = '';
    try {
      while (epoch === this.epoch) {
        // Idle rooms send a heartbeat every eight seconds.
        const deadline = setTimeout(() => controller.abort(), 18000);
        let chunk;
        try { chunk = await reader.read(); } finally { clearTimeout(deadline); }
        if (epoch !== this.epoch) return;
        if (chunk.done) throw new Error('The room connection closed.');
        pending += decoder.decode(chunk.value, { stream: true });
        let end;
        while ((end = pending.indexOf('\n\n')) >= 0) {
          const message = pending.slice(0, end);
          pending = pending.slice(end + 2);
          if (!message.startsWith('data: ')) continue;
          const packet = JSON.parse(message.slice(6));
          if (packet.replaced || packet.room?.status === 'closed') {
            this.connected = false;
            this.connecting = false;
            if (!packet.replaced) {
              this.forgetSeat();
              this.receive(packet);
            }
            const error = new Error(packet.room?.reason || 'This seat is connected in another tab.');
            error.status = 410;
            throw error;
          }
          const initial = !this.connected;
          this.connected = true;
          this.connecting = false;
          this.receive(packet);
          if (initial) this.onStatus('');
        }
        if (pending.length > 8 * 1024 * 1024) throw new Error('The room returned an oversized packet.');
      }
    } finally { reader.cancel().catch(() => {}); }
  }

  async run(epoch) {
    let attempt = 0, disconnectedAt = Date.now();
    while (epoch === this.epoch) {
      const controller = new AbortController();
      this.stream = controller;
      try {
        await this.read(epoch, controller);
        return;
      } catch (error) {
        if (epoch !== this.epoch) return;
        if (this.connected) {
          attempt = 0;
          disconnectedAt = Date.now();
        }
        this.connected = false;
        if ([401, 404, 410].includes(error.status) || Date.now() - disconnectedAt > 110000) {
          if (error.status !== 410) this.forgetSeat();
          this.connecting = false;
          this.code = null;
          this.token = null;
          this.room = null;
          this.onError(error);
          return;
        }
        this.connecting = true;
        this.onStatus('Connection lost. Reconnecting…');
        await wait(Math.min(5000, 500 * 2 ** Math.min(attempt++, 4)));
      } finally { controller.abort(); }
    }
  }

  command(type, data = {}) {
    if (!this.connected || !this.code) return Promise.resolve(false);
    const epoch = this.epoch, phase = this.phase, code = this.code;
    const send = async () => {
      if (epoch !== this.epoch || phase !== this.phase) return false;
      try {
        return await this.request('/api/rooms/' + code + '/command', {
          payload: { ...data, type, phase },
          signal: this.lifecycle.signal,
          retry: type === 'ready' || type === 'rematch' || type === 'select' ? 2 : 0,
        });
      } catch (error) {
        if (epoch === this.epoch) this.onError(error);
        return false;
      }
    };
    const result = this.queue.then(send);
    this.queue = result.catch(() => {});
    return result;
  }

  input({ x, y, sprint }) {
    if (!this.connected || this.room?.status !== 'playing' || this.movesInFlight >= 3) return;
    const timestamp = performance.now(), previous = this.lastMove;
    const changed = !previous || Math.abs(x - previous.x) > .04 || Math.abs(y - previous.y) > .04 || sprint !== previous.sprint;
    const moving = Boolean(x || y || sprint);
    if (timestamp - this.lastMoveAt < 33 || (!changed && (!moving || timestamp - this.lastMoveAt < 100))) return;
    const epoch = this.epoch;
    this.lastMoveAt = timestamp;
    this.lastMove = { x, y, sprint };
    this.movesInFlight++;
    this.request('/api/rooms/' + this.code + '/command', {
      payload: { type: 'move', phase: this.phase, seq: ++this.seq, x, y, sprint },
      signal: this.lifecycle.signal,
      timeout: 600,
    }).catch(() => { if (epoch === this.epoch) this.lastMove = null; })
      .finally(() => { if (epoch === this.epoch) this.movesInFlight--; });
  }

  async leave() {
    const code = this.code, token = this.token;
    ++this.epoch;
    this.lifecycle?.abort();
    this.stream?.abort();
    this.forgetSeat();
    Object.assign(this, {
      code: null, token: null, side: null, phase: null, room: null, connected: false,
      connecting: false, movesInFlight: 0, lastMove: null, queue: Promise.resolve(),
    });
    if (code && token) await this.request('/api/rooms/' + code + '/command', {
      payload: { type: 'leave' }, token, timeout: 3000,
    }).catch(() => {});
  }
}
