import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

export function createStorage({ env = process.env, directory = new URL('.', import.meta.url).pathname, fetcher = fetch, bankVersion = '2026-11-25.v1', now = Date.now } = {}) {
  const mode = env.BK_STORAGE || (env.NODE_ENV === 'production' ? 'unavailable' : 'local');
  let healthy = false;
  let checkedAt = -Infinity;
  let healthPromise = null;
  let writeQueue = Promise.resolve();
  const filename = env.BK_LOCAL_FILE || join(directory, '.local', 'records.json');

  const unavailable = () => new Error('The shared leaderboard is temporarily unavailable. Your completed round can be retried.');

  async function rpc(name, body) {
    const url = env.BK_SUPABASE_URL;
    const key = env.BK_SUPABASE_ANON_KEY;
    if (mode !== 'supabase' || !/^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/.test(url || '') || !key || !env.BK_WRITE_TOKEN) throw unavailable();
    const headers = { apikey: key, 'Content-Type': 'application/json' };
    if (key.startsWith('eyJ')) headers.Authorization = `Bearer ${key}`;
    const response = await fetcher(`${url.replace(/\/$/, '')}/rest/v1/rpc/${name}`, { method: 'POST', headers, body: JSON.stringify(body), signal: AbortSignal.timeout(6000) });
    if (!response.ok) throw unavailable();
    return response.status === 204 ? null : await response.json();
  }

  async function localRead() {
    try {
      const data = JSON.parse(await readFile(filename, 'utf8'));
      if (!Array.isArray(data.runs) || !Array.isArray(data.reports)) throw new Error('Invalid local store.');
      return data;
    } catch (error) {
      if (error.code === 'ENOENT') return { runs: [], reports: [] };
      throw error;
    }
  }

  function localWrite(change) {
    const pending = writeQueue.catch(() => {}).then(async () => {
      const data = await localRead();
      change(data);
      await mkdir(dirname(filename), { recursive: true });
      const temp = `${filename}.${process.pid}.tmp`;
      await writeFile(temp, JSON.stringify(data), { encoding: 'utf8', mode: 0o600 });
      await rename(temp, filename);
    });
    writeQueue = pending;
    return pending;
  }

  async function leaderboard(period = 'week') {
    if (mode === 'supabase') {
      const raw = await rpc('bk_leaderboard', { p_period: period, p_bank_version: String(bankVersion) });
      const rows = Array.isArray(raw) ? raw : raw?.entries;
      if (!Array.isArray(rows)) throw unavailable();
      return rows.slice(0, 50).map((entry, i) => ({ rank: Number(entry.rank) || i + 1, nickname: String(entry.nickname).slice(0, 20), score: Number(entry.score), correct: Number(entry.correct), total: Number(entry.total), createdAt: entry.created_at || entry.createdAt }));
    }
    if (mode !== 'local') throw unavailable();
    const data = await localRead();
    const cutoff = period === 'week' ? now() - 7 * 86400000 : 0;
    const best = new Map();
    const compare = (a, b) => b.score - a.score || b.correct - a.correct || a.elapsed_ms - b.elapsed_ms || Date.parse(a.created_at) - Date.parse(b.created_at);
    for (const run of data.runs) {
      if (run.bank_version !== String(bankVersion) || Date.parse(run.created_at) < cutoff) continue;
      const existing = best.get(run.player_id);
      if (!existing || compare(run, existing) < 0) best.set(run.player_id, run);
    }
    return [...best.values()].sort(compare).slice(0, 50).map((entry, i) => ({ rank: i + 1, nickname: entry.nickname, score: entry.score, correct: entry.correct, total: entry.total, createdAt: entry.created_at }));
  }

  async function health(force = false) {
    if (!force && now() - checkedAt < 15000) return healthy;
    if (healthPromise) return healthPromise;
    healthPromise = (async () => {
      try { await leaderboard('week'); healthy = true; } catch { healthy = false; }
      checkedAt = now(); healthPromise = null;
      return healthy;
    })();
    return healthPromise;
  }

  async function write(name, body, change) {
    try {
      if (mode === 'supabase') await rpc(name, { p_token: env.BK_WRITE_TOKEN, ...body });
      else if (mode === 'local') await localWrite(change);
      else throw unavailable();
      healthy = true; checkedAt = now();
    } catch {
      healthy = false; checkedAt = now();
      throw unavailable();
    }
  }

  return {
    mode, health, leaderboard,
    async saveRun(record) {
      await write('bk_record_run', { p_run: record }, data => {
        if (!data.runs.some(run => run.id === record.id)) data.runs.push(record);
      });
    },
    async report(record) {
      await write('bk_report_question', { p_report: record }, data => {
        if (!data.reports.some(report => report.id === record.id)) data.reports.push(record);
      });
    },
  };
}
