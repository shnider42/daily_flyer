// Reused from Farwake, feat/farwake-galaxy @ 756fee9ba7456b028fda0dc714829edf33a713ed.
/** Optional, lossless snapshot transport. Simulation and public views stay unchanged. */
export const SNAPSHOT_DELTA_VERSION = 1;

const unchanged = Symbol('unchanged');
const omitted = value => value === undefined || typeof value === 'function' || typeof value === 'symbol';
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const scalar = value => typeof value === 'number' && !Number.isFinite(value) ? null : value;
const assign = (target, key, value) => {
  // JSON permits this property name; assignment must not change a prototype.
  if (key === '__proto__') Object.defineProperty(target, key, { value, enumerable: true, writable: true, configurable: true });
  else target[key] = value;
};

/** Match JSON wire semantics without stringify/parse of every complete snapshot. */
function jsonValue(value) {
  if (Array.isArray(value)) return Array.from(value, child => omitted(child) ? null : jsonValue(child));
  if (object(value)) {
    const result = {};
    for (const key of Object.keys(value)) if (!omitted(value[key])) assign(result, key, jsonValue(value[key]));
    return result;
  }
  return scalar(value);
}

// Scalars replace directly. Structured operations: [0, replacement],
// [1, changed object fields, removed keys],
// [2, changed array indexes, new length]. Array length explicitly removes tails;
// changed indexes preserve insertion, removal and reordering in the middle.
function difference(previous, current, shared, root = false) {
  const shareable = !root && shared && current !== null && typeof current === 'object';
  const cached = shareable ? shared.get(current) : null;
  if (cached && cached.previous === previous) return cached.delta;
  const delta = differenceValue(previous, current, shared, root);
  if (shareable) {
    // The caller supplies one fresh cache for a synchronous broadcast, whose
    // shared public world is immutable. Equal current subtrees may share their
    // normalized baseline even when peers started from different baselines.
    if (cached && delta !== unchanged) delta.value = cached.value;
    shared.set(current, { previous, delta, value: delta === unchanged ? previous : delta.value });
  }
  return delta;
}

function differenceValue(previous, current, shared, root) {
  if (Array.isArray(current)) {
    if (!Array.isArray(previous)) { const value = jsonValue(current); return { value, patch: [0, value] }; }
    let value = null, changes = null;
    for (let index = 0; index < current.length; index++) {
      const child = omitted(current[index]) ? null : current[index];
      if (child === null || typeof child !== 'object') {
        const normalized = scalar(child);
        if (previous[index] === normalized) continue;
        value ||= previous.slice(); changes ||= {};
        value[index] = normalized; changes[index] = normalized; continue;
      }
      const delta = difference(previous[index], child, shared);
      if (delta === unchanged) continue;
      value ||= previous.slice(); changes ||= {};
      value[index] = delta.value; changes[index] = delta.patch;
    }
    if (previous.length !== current.length) { value ||= previous.slice(); value.length = current.length; }
    return value ? { value, patch: [2, changes || {}, current.length] } : unchanged;
  }
  if (object(current)) {
    if (!object(previous)) { const value = jsonValue(current); return { value, patch: [0, value] }; }
    const currentKeys = Object.keys(current), previousKeys = Object.keys(previous);
    // Entity shapes are stable during motion. Avoid a property-existence scan
    // for every field twice on the common path, while preserving deletions.
    let sameShape = currentKeys.length === previousKeys.length;
    if (sameShape) for (let index = 0; index < currentKeys.length; index++) if (currentKeys[index] !== previousKeys[index] || omitted(current[currentKeys[index]])) { sameShape = false; break; }
    let value = null, changes = null, removed = null;
    for (const key of currentKeys) {
      if (omitted(current[key])) continue;
      const child = current[key];
      if (child === null || typeof child !== 'object') {
        const normalized = scalar(child);
        if ((sameShape || Object.hasOwn(previous, key)) && previous[key] === normalized) continue;
        value ||= { ...previous }; changes ||= {};
        assign(value, key, normalized); assign(changes, key, normalized); continue;
      }
      const delta = difference(sameShape || Object.hasOwn(previous, key) ? previous[key] : undefined, current[key], root && key !== 'world' ? null : shared);
      if (delta === unchanged) continue;
      value ||= { ...previous }; changes ||= {};
      assign(value, key, delta.value); assign(changes, key, delta.patch);
    }
    if (!sameShape) for (const key of previousKeys) if (!Object.hasOwn(current, key) || omitted(current[key])) {
      value ||= { ...previous }; removed ||= [];
      delete value[key]; removed.push(key);
    }
    return value ? { value, patch: [1, changes || {}, removed || []] } : unchanged;
  }
  const value = scalar(current);
  return previous === value ? unchanged : { value, patch: value };
}

/** Apply without changing the baseline. Malformed patches are rejected atomically. */
function applyPatch(previous, patch) {
  if (patch === null || ['string', 'number', 'boolean'].includes(typeof patch)) return patch;
  if (!Array.isArray(patch)) throw new Error('Invalid snapshot patch.');
  if (patch[0] === 0 && patch.length === 2) return patch[1];
  if (patch[0] === 1 && patch.length === 3 && object(previous) && object(patch[1]) && Array.isArray(patch[2])) {
    const next = { ...previous };
    for (const key of patch[2]) { if (typeof key !== 'string') throw new Error('Invalid snapshot field.'); delete next[key]; }
    for (const key of Object.keys(patch[1])) assign(next, key, applyPatch(Object.hasOwn(previous, key) ? previous[key] : undefined, patch[1][key]));
    return next;
  }
  if (patch[0] === 2 && patch.length === 3 && Array.isArray(previous) && object(patch[1]) && Number.isSafeInteger(patch[2]) && patch[2] >= 0 && patch[2] <= 100000) {
    const next = previous.slice(0, patch[2]); next.length = patch[2];
    for (const key of Object.keys(patch[1])) {
      const index = Number(key);
      if (!Number.isSafeInteger(index) || index < 0 || index >= patch[2] || String(index) !== key) throw new Error('Invalid snapshot index.');
      next[index] = applyPatch(previous[index], patch[1][key]);
    }
    // A longer array must supply every new element; holes are not a JSON value.
    for (let index = previous.length; index < next.length; index++) if (!Object.hasOwn(next, index)) throw new Error('Missing snapshot element.');
    return next;
  }
  throw new Error('Invalid snapshot operation.');
}

/** Prepared baselines are committed only after the WebSocket accepts the send. */
export class SnapshotDeltaEncoder {
  constructor() { this.reset(); }
  reset() { this.baseline = null; this.sequence = 0; }
  prepare(snapshot, { reset = false, shared = null } = {}) {
    const sequence = this.sequence + 1;
    const delta = difference(this.baseline, snapshot, shared, true);
    const baseline = delta === unchanged ? this.baseline : delta.value;
    const full = reset || !this.baseline;
    const packet = full
      ? { ...baseline, snapshotDelta: SNAPSHOT_DELTA_VERSION, snapshotId: sequence }
      : { type: snapshot.type, tick: snapshot.tick, snapshotDelta: SNAPSHOT_DELTA_VERSION, snapshotId: sequence, baseSnapshotId: this.sequence, patch: delta === unchanged ? [1, {}, []] : delta.patch };
    return { packet, data: JSON.stringify(packet), baseline, sequence, previousSequence: this.sequence, full };
  }
  commit(prepared) {
    if (prepared.previousSequence !== this.sequence) throw new Error('Snapshot baseline changed before send.');
    this.baseline = prepared.baseline; this.sequence = prepared.sequence;
  }
}

/** Keep the wire baseline separate from mutable game/prediction objects. */
export class SnapshotDeltaDecoder {
  constructor() { this.reset(); }
  reset() { this.baseline = null; this.sequence = 0; }
  decode(packet) {
    if (packet?.snapshotDelta !== SNAPSHOT_DELTA_VERSION) { this.reset(); return packet; }
    if (!Number.isSafeInteger(packet.snapshotId) || packet.snapshotId < 1) { this.reset(); return null; }
    const isDelta = Object.hasOwn(packet, 'baseSnapshotId');
    if (isDelta && (!this.baseline || packet.baseSnapshotId !== this.sequence || packet.snapshotId <= this.sequence)) { this.reset(); return null; }
    try {
      let next;
      if (isDelta) next = applyPatch(this.baseline, packet.patch);
      else {
        const { snapshotDelta, snapshotId, ...snapshot } = packet;
        if (!snapshot.state || !snapshot.room) throw new Error('Incomplete full snapshot.');
        next = snapshot;
      }
      // Full packet objects and replacement objects belong to the caller too.
      // Clone once into the private baseline; the returned tree remains mutable.
      this.baseline = structuredClone(next); this.sequence = packet.snapshotId;
      return next;
    } catch { this.reset(); return null; }
  }
}
