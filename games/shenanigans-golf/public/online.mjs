/** Same-origin private rooms. Credentials never enter an invite or shared state. */
const STORAGE = 'shenanigans-golf-room-v1';
const delay = ms => new Promise(resolve => { const timer = setTimeout(resolve, ms); timer.unref?.(); });
function saved(baseUrl = '') {
  try {
    const value = JSON.parse(sessionStorage.getItem(STORAGE) || 'null');
    return value && /^[A-Z2-9]{6}$/.test(value.code) && /^[a-f0-9]{64}$/.test(value.token) &&
      (value.baseUrl || '') === baseUrl ? value : null;
  } catch { return null; }
}
function remember(session) { try { sessionStorage.setItem(STORAGE, JSON.stringify(session)); } catch {} }
function forget(expected) {
  try {
    const current = JSON.parse(sessionStorage.getItem(STORAGE) || 'null');
    if (expected && current?.code === expected.code && current?.token === expected.token)
      sessionStorage.removeItem(STORAGE);
  } catch {}
}
function cancelled() { const error = new Error('That room request was cancelled.'); error.code = 'cancelled'; return error; }

export class OnlineGolf {
  static saved = saved;
  constructor({ onSnapshot = () => {}, onStatus = () => {}, baseUrl = '', fetchImpl = globalThis.fetch } = {}) {
    this.onSnapshot = onSnapshot; this.onStatus = onStatus; this.baseUrl = baseUrl.replace(/\/$/, '');
    this.fetch = (...args) => fetchImpl.call(globalThis, ...args);
    this.session = null; this.snapshot = null; this.alive = false; this.connected = false;
    this.controller = null; this.sequence = 0; this.queue = Promise.resolve();
    this.generation = 0; this.requests = new Set(); this.streamTask = null;
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
        const result = await response.json().catch(() => ({ error: 'The course server returned an unreadable response.' }));
        if (!valid()) throw cancelled();
        if (!response.ok || result.ok === false) {
          const error = new Error(result.error || 'The room could not complete that request.');
          error.status = response.status; error.code = result.code; error.snapshot = result.snapshot; throw error;
        }
        return result;
      } catch (error) {
        if (!valid() || error.code === 'cancelled') throw cancelled();
        if (retry && !error.status && attempt++ < 1) { await delay(400); continue; }
        if (error.name === 'AbortError') throw new Error('The course server is taking a little longer to wake up. Try again in a moment.');
        throw error;
      } finally { clearTimeout(timer); this.requests.delete(controller); }
    }
  }
  accept(snapshot, generation = this.generation, session = this.session) {
    if (!snapshot || !this.current(generation, session) || snapshot.code !== session.code) return;
    // Revision increases across rematches as well as within a round.
    if (this.snapshot && Number.isFinite(snapshot.revision) && Number.isFinite(this.snapshot.revision) &&
      snapshot.revision < this.snapshot.revision) return;
    this.snapshot = snapshot; this.onSnapshot(snapshot);
    if (snapshot.closed && this.current(generation, session))
      this.closed(snapshot.reason || 'This room has ended. Return to the clubhouse to start another.');
  }
  closed(reason) {
    const session = this.session;
    this.generation++; this.alive = false; this.connected = false;
    this.controller?.abort(); this.controller = null;
    for (const controller of this.requests) controller.abort();
    this.requests.clear(); forget(session); this.onStatus('closed', reason);
  }
  async attach(data, expectedGeneration) {
    if (expectedGeneration === undefined) { this.destroy(false); expectedGeneration = this.generation; }
    if (expectedGeneration !== this.generation) throw cancelled();
    this.session = { code: data.code, token: data.token, playerId: data.playerId,
      lastSeq: data.lastSeq || 0, baseUrl: this.baseUrl };
    this.sequence = this.session.lastSeq; remember(this.session); this.alive = true;
    const session = this.session;
    this.accept(data.snapshot, expectedGeneration, session);
    if (this.current(expectedGeneration, session)) {
      this.onStatus('connecting', 'Connecting to your group…');
      this.streamTask = this.streamLoop(expectedGeneration, session);
    }
    return data;
  }
  async create(options) {
    this.destroy(false); const generation = this.generation;
    this.onStatus('connecting', 'Opening a private room…');
    const data = await this.json('/api/rooms', options, null, { valid: () => generation === this.generation });
    return this.attach(data, generation);
  }
  async join(code, name) {
    this.destroy(false); const generation = this.generation;
    const normalized = String(code || '').trim().toUpperCase();
    if (!/^[A-Z2-9]{6}$/.test(normalized)) throw new Error('Enter the six-character room code from your friend.');
    this.onStatus('connecting', 'Joining your group…');
    const data = await this.json(`/api/rooms/${normalized}/join`, { name }, null, { valid: () => generation === this.generation });
    return this.attach(data, generation);
  }
  async resume() {
    const session = saved(this.baseUrl);
    if (!session) throw new Error('There is no saved room in this tab. Use your room code to join.');
    this.destroy(false); const generation = this.generation;
    this.onStatus('connecting', 'Reclaiming your place…');
    try {
      const data = await this.json(`/api/rooms/${session.code}/rejoin`, {}, session.token,
        { valid: () => generation === this.generation });
      return this.attach({ ...data, token: data.token || session.token }, generation);
    } catch (error) {
      if ([401, 404, 410].includes(error.status)) forget(session);
      throw error;
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
          const error = new Error(body.error || 'The room connection was interrupted.'); error.status = response.status; throw error;
        }
        if (!response.body) throw new Error('The room connection could not open.');
        this.connected = true; failures = 0; this.onStatus('connected', 'Connected');
        const reader = response.body.getReader(), decoder = new TextDecoder(); let buffer = '';
        pulse();
        try {
          while (this.current(generation, session)) {
            const { done, value } = await reader.read();
            if (done || !this.current(generation, session)) break;
            pulse(); buffer += decoder.decode(value, { stream: true }).replace(/\r/g, '');
            if (buffer.length > 512 * 1024) throw new Error('Room snapshot was too large.');
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
        if (this.current(generation, session)) throw new Error('The connection to your group dropped.');
      } catch (error) {
        if (!this.current(generation, session)) break;
        this.connected = false;
        if ([401, 403, 404, 410].includes(error.status)) {
          this.closed(error.message || 'This room has ended. Start a new one from the clubhouse.'); break;
        }
        this.onStatus('reconnecting', 'Reconnecting… a computer will cover your place if needed.'); failures++;
      } finally {
        clearTimeout(watchdog);
        if (this.controller === controller) this.controller = null;
      }
      if (this.current(generation, session)) await delay(Math.min(5000, 600 * 2 ** Math.min(failures, 3)));
    }
  }
  input(action, extra = {}) {
    const generation = this.generation, session = this.session;
    const roundId = this.snapshot?.roundId, holeIndex = this.snapshot?.holeIndex;
    const send = async () => {
      if (!session || !this.current(generation, session)) throw cancelled();
      const seq = ++this.sequence; session.lastSeq = seq; remember(session);
      const payload = { ...extra, seq, roundId, holeIndex, action };
      try {
        const result = await this.json(`/api/rooms/${session.code}/input`, payload, session.token,
          { timeout: 15000, retry: true, valid: () => this.current(generation, session) });
        this.accept(result.snapshot, generation, session); return result;
      } catch (error) { this.accept(error.snapshot, generation, session); throw error; }
    };
    const promise = this.queue.then(send, send); this.queue = promise.catch(() => {}); return promise;
  }
  async leave() {
    const session = this.session, snapshot = this.snapshot;
    const payload = { seq: this.sequence + 1, roundId: snapshot?.roundId, holeIndex: snapshot?.holeIndex, action: 'leave' };
    // Detach first: a delayed leave reply must never reopen the old game.
    this.destroy(true);
    if (!session) return;
    try {
      return await this.json(`/api/rooms/${session.code}/input`, payload, session.token,
        { timeout: 8000, retry: true, track: false });
    } catch (error) { if (![401, 404, 410].includes(error.status)) throw error; }
  }
  destroy(clear = true) {
    const session = this.session;
    this.generation++; this.alive = false; this.connected = false;
    this.controller?.abort(); this.controller = null;
    for (const controller of this.requests) controller.abort();
    this.requests.clear();
    if (clear) forget(session);
    this.session = null; this.snapshot = null; this.queue = Promise.resolve();
  }
}
