import { normalizeCameraPreferences } from './camera-preferences.mjs';

const FIELDS = ['shipZoom', 'personZoom'];
const MAX_CONFLICT_RETRIES = 3;
const validRevision = value => Number.isSafeInteger(value) && value >= 0;

function authorityFrom(value) {
  const preferences = value?.cameraPreferences;
  if (!validRevision(value?.cameraRevision) || !preferences ||
      FIELDS.some(field => typeof preferences[field] !== 'number' || !Number.isFinite(preferences[field]))) return null;
  return { preferences: normalizeCameraPreferences(preferences), revision: value.cameraRevision };
}

/**
 * Coordinates camera preferences without storing credentials or game data.
 *
 * activateShared.send(args) returns FarwakeNetwork.command()'s result envelope
 * ({ result: { ok, cameraPreferences, cameraRevision, code? }, ...snapshot })
 * or that inner result directly. A snapshot can update the known server values,
 * but only a command acknowledgment clears pending user edits.
 *
 * Activating a profile discards the previous profile's pending work. The app can
 * await flush() before switching, and owns local save/export/practice lifecycle.
 * flush() resolves true when this scope is settled, or false after a transport
 * failure, rejected command, exhausted conflict retries, or a profile switch.
 */
export class CameraProfile {
  constructor({ onChange = () => {}, schedule = (callback, ms) => globalThis.setTimeout(callback, ms), cancel = timer => globalThis.clearTimeout(timer), delay = 250 } = {}) {
    this._onChange = onChange;
    this._schedule = schedule;
    this._cancel = cancel;
    this._delay = delay;
    this._generation = 0;
    this._edit = 0;
    this._base = normalizeCameraPreferences();
    this._pending = new Map();
    this._revision = 0;
    this._status = 'local';
    this._scope = { kind: 'local', generation: this._generation };
    this._timer = null;
    this._flight = null;
  }

  get preferences() {
    const preferences = { ...this._base };
    for (const [field, edit] of this._pending) preferences[field] = edit.value;
    return preferences;
  }

  get status() { return this._status; }

  activateLocal(preferences, { practice = false } = {}) {
    this._replaceScope({ kind: 'local', practice });
    this._base = normalizeCameraPreferences(preferences);
    this._status = practice ? 'practice' : 'local';
    this._emit();
    return this.preferences;
  }

  activateShared({ key, preferences, revision, send, seedPreferences, pendingChanges } = {}) {
    if (typeof key !== 'string' || !key || typeof send !== 'function') throw new TypeError('A shared camera profile needs a key and send function.');
    this._replaceScope({ kind: 'shared', key, send });
    this._base = normalizeCameraPreferences(preferences);
    this._revision = validRevision(revision) ? revision : 0;
    if (this._revision === 0 && seedPreferences !== undefined) {
      const seed = normalizeCameraPreferences(seedPreferences, this._base);
      // Seed both modes, even if one equals the default: revision zero means
      // this captain has not yet claimed their legacy browser preferences.
      for (const field of FIELDS) this._pending.set(field, { value: seed[field], id: ++this._edit, seed: true });
    }
    // An unsent browser edit is useful only against the same authority version.
    // If another device has progressed the profile, its newer saved values win.
    const cachedFields = pendingChanges?.fields;
    const cachedKeys = cachedFields && typeof cachedFields === 'object' && !Array.isArray(cachedFields) ? Object.keys(cachedFields) : [];
    if (pendingChanges?.key === key && pendingChanges.revision === this._revision && cachedKeys.length &&
        cachedKeys.every(field => FIELDS.includes(field) && typeof cachedFields[field] === 'number' && Number.isFinite(cachedFields[field]))) {
      const restored = normalizeCameraPreferences(cachedFields, this._base);
      for (const field of cachedKeys) this._pending.set(field, { value: restored[field], id: ++this._edit, seed: false });
    }
    this._status = this._pending.size ? 'saving' : 'saved';
    this._emit();
    if (this._pending.size) this._queue();
    return this.preferences;
  }

  exportPending() {
    if (this._scope.kind !== 'shared') return null;
    const fields = {};
    for (const [field, edit] of this._pending) if (!edit.seed) fields[field] = edit.value;
    return Object.keys(fields).length ? { key: this._scope.key, revision: this._revision, fields } : null;
  }

  receiveShared({ key, preferences, revision } = {}) {
    if (this._scope.kind !== 'shared' || key !== this._scope.key || !validRevision(revision) || revision <= this._revision) return false;
    this._base = normalizeCameraPreferences(preferences, this._base);
    this._revision = revision;
    // Another device may finish legacy migration before this debounce fires.
    // A real slider edit still wins locally; untouched migration seeds yield.
    if (!this._flight) this._dropInitializedSeeds();
    if (!this._pending.size) {
      this._clearTimer();
      this._status = 'saved';
    }
    this._emit();
    return true;
  }

  set(mode, value) {
    if (mode !== 'ship' && mode !== 'person') throw new TypeError('Camera mode must be ship or person.');
    const field = mode === 'ship' ? 'shipZoom' : 'personZoom';
    const current = this.preferences;
    const next = normalizeCameraPreferences({ [field]: value }, current)[field];
    if (next === current[field]) return current;
    if (this._scope.kind === 'shared') {
      this._pending.set(field, { value: next, id: ++this._edit, seed: false });
      this._status = 'saving';
      if (!this._flight) this._queue();
    } else {
      this._base[field] = next;
    }
    this._emit();
    return this.preferences;
  }

  flush() {
    this._clearTimer();
    if (this._scope.kind !== 'shared') return Promise.resolve(true);
    if (this._flight) return this._flight.promise;
    this._dropInitializedSeeds();
    if (!this._pending.size) {
      if (this._status !== 'saved') { this._status = 'saved'; this._emit(); }
      return Promise.resolve(true);
    }
    const scope = this._scope;
    const flight = { generation: scope.generation, promise: null };
    flight.promise = Promise.resolve().then(() => this._drain(scope)).finally(() => {
      if (this._scope === scope && this._flight === flight) this._flight = null;
    });
    this._flight = flight;
    this._status = 'saving';
    this._emit();
    return flight.promise;
  }

  _replaceScope(scope) {
    this._clearTimer();
    this._scope = { ...scope, generation: ++this._generation };
    this._pending = new Map();
    this._revision = 0;
    this._flight = null;
  }

  _clearTimer() {
    if (this._timer) this._cancel(this._timer.id);
    this._timer = null;
  }

  _queue() {
    this._clearTimer();
    const scope = this._scope, token = { id: null };
    this._timer = token;
    token.id = this._schedule(() => {
      if (this._scope !== scope || this._timer !== token) return;
      this._timer = null;
      void this.flush();
    }, this._delay);
  }

  _dropInitializedSeeds() {
    if (this._revision === 0) return;
    for (const [field, edit] of this._pending) if (edit.seed) this._pending.delete(field);
  }

  _adopt(record) {
    if (!record || record.revision <= this._revision) return;
    this._base = record.preferences;
    this._revision = record.revision;
  }

  _emit() { this._onChange(this.preferences, this._status); }

  async _drain(scope) {
    let conflicts = 0;
    while (this._scope === scope && this._pending.size) {
      const batch = new Map(this._pending), expectedRevision = this._revision;
      const args = { expectedRevision };
      for (const [field, edit] of batch) args[field] = edit.value;
      let response;
      try { response = await scope.send(args); }
      catch {
        if (this._scope === scope) { this._status = 'offline'; this._emit(); }
        return false;
      }
      if (this._scope !== scope) return false;
      const result = response?.result && typeof response.result === 'object' ? response.result : response;
      const acknowledged = authorityFrom(result);
      this._adopt(acknowledged);
      // An idempotent result can describe an earlier revision than the packet's
      // fresh snapshot. Never roll a newer authority revision back to that ack.
      if (response !== result) this._adopt(authorityFrom(response));

      if (result?.ok === true && acknowledged && acknowledged.revision > expectedRevision &&
          [...batch].every(([field, edit]) => acknowledged.preferences[field] === edit.value)) {
        for (const [field, edit] of batch) {
          if (this._pending.get(field)?.id === edit.id) this._pending.delete(field);
        }
        conflicts = 0;
        this._status = this._pending.size ? 'saving' : 'saved';
        this._emit();
        continue;
      }

      if (result?.code === 'camera-conflict' && acknowledged) {
        this._dropInitializedSeeds();
        if (!this._pending.size) { this._status = 'saved'; this._emit(); return true; }
        if (conflicts++ < MAX_CONFLICT_RETRIES) {
          this._status = 'saving';
          this._emit();
          continue;
        }
      }
      this._status = 'offline';
      this._emit();
      return false;
    }
    return this._scope === scope;
  }
}

export default CameraProfile;
