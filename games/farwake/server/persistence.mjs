import { mkdir, readFile, rename, open } from 'node:fs/promises';
import path from 'node:path';
import { randomBytes } from 'node:crypto';

export class PersistenceConflict extends Error {
  constructor(version) { super('A newer realm revision exists. This process will not overwrite it.'); this.name = 'PersistenceConflict'; this.version = version; }
}

const validId = id => typeof id === 'string' && /^[A-Z0-9]{6,12}$/.test(id);

/** Atomic, versioned development storage. Production uses the authenticated gateway. */
export class FilePersistence {
  constructor(directory) { this.directory = path.resolve(directory); this.durable = false; this.kind = 'local-development'; this.locks = new Map(); }
  async ping() { await mkdir(this.directory, { recursive: true, mode: 0o700 }); return { ok: true }; }
  file(id) { if (!validId(id)) throw new Error('Invalid realm identifier'); return path.join(this.directory, `${id}.json`); }
  async load(id) {
    try { const data = JSON.parse(await readFile(this.file(id), 'utf8')); return { version: data.version, snapshot: data.snapshot }; }
    catch (error) { if (error.code === 'ENOENT') return { version: 0, snapshot: null }; throw error; }
  }
  async save(id, expectedVersion, snapshot) {
    const preceding = this.locks.get(id) || Promise.resolve();
    const task = preceding.catch(() => {}).then(async () => {
      await this.ping();
      const current = await this.load(id);
      if (current.version !== expectedVersion) throw new PersistenceConflict(current.version);
      const version = current.version + 1;
      const target = this.file(id), temporary = `${target}.${randomBytes(8).toString('hex')}.tmp`;
      const file = await open(temporary, 'wx', 0o600);
      try { await file.writeFile(JSON.stringify({ version, snapshot })); await file.sync(); } finally { await file.close(); }
      await rename(temporary, target);
      // Persist the directory entry too where the filesystem supports it.
      const directory = await open(this.directory, 'r');
      try { await directory.sync(); } finally { await directory.close(); }
      return { version };
    });
    this.locks.set(id, task);
    try { return await task; } finally { if (this.locks.get(id) === task) this.locks.delete(id); }
  }
}

/** Server-only HTTP adapter. The secret never appears in a snapshot or browser bundle. */
export class GatewayPersistence {
  constructor(url, key, { fetchImpl = fetch, timeoutMs = 12000 } = {}) {
    if (!url || !key) throw new Error('FARWAKE_STORAGE_URL and FARWAKE_STORAGE_KEY are required together.');
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:' && parsed.hostname !== '127.0.0.1' && parsed.hostname !== 'localhost') throw new Error('The storage gateway requires HTTPS.');
    this.url = url; this.key = key; this.fetch = fetchImpl; this.timeoutMs = timeoutMs; this.durable = true; this.kind = 'gateway';
  }
  async request(body) {
    const response = await this.fetch(this.url, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${this.key}` }, body: JSON.stringify(body), signal: AbortSignal.timeout(this.timeoutMs) });
    let data; try { data = await response.json(); } catch { throw new Error(`Storage gateway returned HTTP ${response.status} without JSON.`); }
    if (response.status === 409 || data.conflict) throw new PersistenceConflict(data.version);
    if (!response.ok || !data.ok) throw new Error(`Storage gateway failed (${response.status}).`);
    return data;
  }
  async ping() { return this.request({ op: 'ping' }); }
  async load(id) { if (!validId(id)) throw new Error('Invalid realm identifier'); const data = await this.request({ op: 'load', realmId: id }); return { version: Number(data.version) || 0, snapshot: data.snapshot || null }; }
  async save(id, expectedVersion, snapshot) { const data = await this.request({ op: 'save', realmId: id, expectedVersion, snapshot }); return { version: data.version }; }
}

export function persistenceFromEnvironment(env = process.env) {
  if (env.FARWAKE_STORAGE_URL || env.FARWAKE_STORAGE_KEY) return new GatewayPersistence(env.FARWAKE_STORAGE_URL, env.FARWAKE_STORAGE_KEY);
  if (env.NODE_ENV === 'production') throw new Error('Production startup refused: durable FARWAKE_STORAGE_URL / FARWAKE_STORAGE_KEY are not configured.');
  return new FilePersistence(env.FARWAKE_DATA_DIR || './.farwake-data');
}
