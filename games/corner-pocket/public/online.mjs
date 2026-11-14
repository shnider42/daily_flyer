/** Authenticated two-player rooms. Invitations never contain a seat credential. */
const STORAGE = 'corner-pocket-session';
const delay = ms => new Promise(resolve => { const timer = setTimeout(resolve, ms); timer.unref?.(); });
function saved(baseUrl = '') {
  try {
    const value = JSON.parse(sessionStorage.getItem(STORAGE) || 'null');
    return value && /^[A-Z2-9]{6}$/.test(value.code) && /^[a-f0-9]{64}$/.test(value.token) &&
      [0, 1].includes(value.seatIndex) && (value.baseUrl || '') === baseUrl ? value : null;
  } catch { return null; }
}
function remember(session) { try { sessionStorage.setItem(STORAGE, JSON.stringify(session)); } catch {} }
function forget(expected) {
  try {
    const current = JSON.parse(sessionStorage.getItem(STORAGE) || 'null');
    if (!expected || current?.code === expected.code && current?.token === expected.token)
      sessionStorage.removeItem(STORAGE);
  } catch {}
}
function cancelled() { const error = new Error('That room request was cancelled.'); error.code = 'cancelled'; return error; }

export class OnlineRoom {
  static saved = saved;
  constructor({ onSnapshot = () => {}, onStatus = () => {}, onError = () => {},
    baseUrl = '', fetchImpl = globalThis.fetch } = {}) {
    Object.assign(this, { onSnapshot, onStatus, onError });
    this.baseUrl = baseUrl.replace(/\/$/, ''); this.fetch = (...args) => fetchImpl.call(globalThis, ...args);
    this.session = null; this.snapshot = null; this.alive = false; this.connected = false;
    this.controller = null; this.sequence = 0; this.aimSequence = 0; this.queue = Promise.resolve();
    this.generation = 0; this.requests = new Set(); this.streamTask = null; this.aimPending = false;
  }
  current(generation, session = this.session) {
    return this.alive && generation === this.generation && session === this.session;
  }
  async json(path, data, token, { timeout = 60000, retry = false, track = true, valid = () => true } = {}) {
    let attempt = 0;
    for (;;) {
      if (!valid()) throw cancelled();
      const controller = new AbortController(), timer = setTimeout(() => controller.abort(), timeout);
      if (track) this.requests.add(controller);
      try {
        const response = await this.fetch(this.baseUrl + path, { method: 'POST',
          headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
          body: JSON.stringify(data), signal: controller.signal, cache: 'no-store' });
        const result = await response.json().catch(() => ({ error: 'The table returned an unreadable response.' }));
        if (!valid()) throw cancelled();
        if (!response.ok || result.ok === false) {
          const error = new Error(result.error || 'The table could not complete that request.');
          error.status = response.status; error.code = result.code; error.snapshot = result.snapshot; throw error;
        }
        return result;
      } catch (error) {
        if (!valid() || error.code === 'cancelled') throw cancelled();
        if (retry && !error.status && attempt++ < 1) { await delay(300); continue; }
        if (error.name === 'AbortError') throw new Error('The table server is taking longer to respond. Try again in a moment.');
        throw error;
      } finally { clearTimeout(timer); this.requests.delete(controller); }
    }
  }
  accept(snapshot, generation = this.generation, session = this.session) {
    if (!snapshot || !session || !this.current(generation, session) || snapshot.code !== session.code) return;
    if (this.snapshot && Number.isFinite(snapshot.revision) && Number.isFinite(this.snapshot.revision) &&
      snapshot.revision < this.snapshot.revision) return;
    this.snapshot = snapshot; this.onSnapshot(snapshot);
    if (snapshot.closed && this.current(generation, session)) this.closed(snapshot.reason || 'This room has ended.');
  }
  closed(reason) {
    const session = this.session;
    this.generation++; this.alive = false; this.connected = false;
    this.controller?.abort(); this.controller = null;
    for (const controller of this.requests) controller.abort();
    this.requests.clear(); forget(session); this.onStatus('offline', reason);
  }
  async attach(data, expectedGeneration) {
    if (expectedGeneration === undefined) { this.destroy(false); expectedGeneration = this.generation; }
    if (expectedGeneration !== this.generation) throw cancelled();
    this.session = { code: data.code, token: data.token, seatIndex: data.seatIndex,
      lastSeq: data.lastSeq || 0, lastAimSeq: data.lastAimSeq || 0, baseUrl: this.baseUrl };
    this.sequence = this.session.lastSeq; this.aimSequence = this.session.lastAimSeq;
    remember(this.session); this.alive = true;
    const session = this.session;
    this.accept(data.snapshot, expectedGeneration, session);
    if (this.current(expectedGeneration, session)) {
      this.onStatus('connecting', 'Connecting to your table…');
      this.streamTask = this.streamLoop(expectedGeneration, session);
    }
    return data;
  }
  async create(name = 'Player') {
    this.destroy(false); const generation = this.generation;
    this.onStatus('connecting', 'Opening a private table…');
    const options = typeof name === 'object' && name !== null ? name : { name };
    const data = await this.json('/api/rooms', options, null, { valid: () => generation === this.generation });
    return this.attach(data, generation);
  }
  async join(code, name = 'Player') {
    this.destroy(false); const generation = this.generation;
    const normalized = String(code || '').trim().toUpperCase();
    if (!/^[A-Z2-9]{6}$/.test(normalized)) throw new Error('Enter the six-character room code from your friend.');
    this.onStatus('connecting', 'Joining your table…');
    const data = await this.json(`/api/rooms/${normalized}/join`, { name }, null,
      { valid: () => generation === this.generation });
    return this.attach(data, generation);
  }
  async resume() {
    const session = saved(this.baseUrl);
    if (!session) throw new Error('There is no saved table in this tab. Use a room code to join.');
    this.destroy(false); const generation = this.generation;
    this.onStatus('connecting', 'Reclaiming your place…');
    try {
      const data = await this.json(`/api/rooms/${session.code}/rejoin`, {}, session.token,
        { valid: () => generation === this.generation });
      return this.attach({ ...data, token: data.token || session.token,
        lastSeq: Math.max(data.lastSeq || 0, session.lastSeq || 0),
        lastAimSeq: Math.max(data.lastAimSeq || 0, session.lastAimSeq || 0) }, generation);
    } catch (error) {
      // An older resume may finish after another room has already been opened.
      // Its failure cannot mark the current connection offline or erase its seat.
      if (generation !== this.generation) throw cancelled();
      if ([401, 403, 404, 410].includes(error.status)) forget(session);
      this.onStatus('offline', error.message); throw error;
    }
  }
  async streamLoop(generation, session) {
    let failures = 0;
    while (this.current(generation, session)) {
      const controller = new AbortController(); this.controller = controller;
      let watchdog;
      const pulse = () => { clearTimeout(watchdog); watchdog = setTimeout(() => controller.abort(), 30000); };
      pulse();
      try {
        const response = await this.fetch(`${this.baseUrl}/api/rooms/${session.code}/stream`, {
          headers: { Authorization: `Bearer ${session.token}` }, signal: controller.signal, cache: 'no-store' });
        if (!this.current(generation, session)) { controller.abort(); break; }
        if (!response.ok) {
          const body = await response.json().catch(() => ({}));
          const error = new Error(body.error || 'The table connection was interrupted.'); error.status = response.status; throw error;
        }
        if (!response.body) throw new Error('The table connection could not open.');
        this.connected = true; failures = 0; this.onStatus('online', 'Connected');
        const reader = response.body.getReader(), decoder = new TextDecoder(); let buffer = '';
        pulse();
        try {
          while (this.current(generation, session)) {
            const { done, value } = await reader.read();
            if (done || !this.current(generation, session)) break;
            pulse(); buffer += decoder.decode(value, { stream: true }).replace(/\r/g, '');
            if (buffer.length > 512 * 1024) throw new Error('The table sent an oversized snapshot.');
            let boundary;
            while ((boundary = buffer.indexOf('\n\n')) !== -1 && this.current(generation, session)) {
              const packet = buffer.slice(0, boundary); buffer = buffer.slice(boundary + 2);
              const data = packet.split('\n').filter(line => line.startsWith('data:')).map(line => line.slice(5).trimStart()).join('\n');
              if (!data) continue;
              let parsed; try { parsed = JSON.parse(data); } catch { continue; }
              this.accept(parsed.snapshot || parsed, generation, session);
            }
          }
        } finally { try { await reader.cancel(); } catch {} reader.releaseLock(); }
        if (this.current(generation, session)) throw new Error('The connection to your table dropped.');
      } catch (error) {
        if (!this.current(generation, session)) break;
        this.connected = false;
        if ([401, 403, 404, 410].includes(error.status)) {
          this.closed(error.message || 'This room has ended. Create a new table.'); break;
        }
        this.onStatus('reconnecting', 'Reconnecting… the table will wait for you.'); failures++;
      } finally {
        clearTimeout(watchdog);
        if (this.controller === controller) this.controller = null;
      }
      if (this.current(generation, session)) await delay(Math.min(5000, 500 * 2 ** Math.min(failures, 3)));
    }
  }
  command(action, extra = {}) {
    if (action === 'aim') return this.sendAim(extra);
    const generation = this.generation, session = this.session;
    const rackId = this.snapshot?.rackId ?? null, shotNumber = this.snapshot?.game?.shotNumber ?? null;
    const send = async () => {
      if (!session || !this.current(generation, session)) throw cancelled();
      if (!this.connected) throw new Error('Reconnect to the table before taking a shot.');
      const seq = ++this.sequence; session.lastSeq = seq; remember(session);
      const payload = { ...extra, seq, rackId, shotNumber, action };
      try {
        const result = await this.json(`/api/rooms/${session.code}/input`, payload, session.token,
          { timeout: 15000, retry: true, valid: () => this.current(generation, session) });
        this.accept(result.snapshot, generation, session); return result;
      } catch (error) {
        this.accept(error.snapshot, generation, session);
        if (this.current(generation, session) && error.code !== 'cancelled') this.onError(error);
        throw error;
      }
    };
    const promise = this.queue.then(send, send); this.queue = promise.catch(() => {}); return promise;
  }
  async sendAim(extra) {
    const generation = this.generation, session = this.session;
    if (!session || !this.current(generation, session) || !this.connected || this.aimPending)
      return { ok: true, ignored: true };
    const payload = { ...extra, action: 'aim', aimSeq: ++this.aimSequence,
      rackId: this.snapshot?.rackId ?? null, shotNumber: this.snapshot?.game?.shotNumber ?? null };
    this.aimPending = true;
    try {
      return await this.json(`/api/rooms/${session.code}/input`, payload, session.token,
        { timeout: 2500, valid: () => this.current(generation, session) });
    } catch { return { ok: false, ignored: true }; }
    finally { if (generation === this.generation) this.aimPending = false; }
  }
  async leave() {
    const session = this.session, snapshot = this.snapshot;
    const payload = { seq: this.sequence + 1, rackId: snapshot?.rackId ?? null,
      shotNumber: snapshot?.game?.shotNumber ?? null, action: 'leave' };
    // Detach before posting: a delayed reply must never reopen the old table.
    this.destroy(true);
    if (!session) return;
    try {
      return await this.json(`/api/rooms/${session.code}/input`, payload, session.token,
        { timeout: 8000, retry: true, track: false });
    } catch (error) { if (![401, 404, 410].includes(error.status)) throw error; }
  }
  destroy(clear = true) {
    const session = this.session;
    this.generation++; this.alive = false; this.connected = false; this.aimPending = false;
    this.controller?.abort(); this.controller = null;
    for (const controller of this.requests) controller.abort();
    this.requests.clear(); if (clear) forget(session);
    this.session = null; this.snapshot = null; this.queue = Promise.resolve();
  }
}
