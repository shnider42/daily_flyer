import assert from "node:assert/strict";
import test from "node:test";
import {createRequire} from "node:module";
import {createHandler, passwordHash, sha256, validateData} from "./index.ts";

const require = createRequire(import.meta.url);
const NotebookData = require("../../daily_flyer/themes/best_man_assets/store.js");
const ORIGIN = "https://for-my-brother.onrender.com";
const BASE = "https://test.supabase.co/functions/v1/best-man-notebook";
const PASSWORD = "a temporary test passphrase";
const SETUP = "s".repeat(64);

async function fixture({initialized = false, modern = true} = {}) {
  const now = Date.now();
  const db = {
    doc: {
      id: "main", password_salt: initialized ? "11".repeat(16) : null,
      password_hash: initialized ? await passwordHash(PASSWORD, "11".repeat(16)) : null,
      password_iterations: 600000, setup_token_hash: initialized ? null : await sha256(SETUP), data: null, version: 0,
    },
    sessions: new Map(), calls: [], limited: false,
  };
  async function fetchFn(url, options) {
    const parsed = new URL(url);
    const table = parsed.pathname.replace("/rest/v1/", "");
    const method = options.method;
    const body = options.body === undefined ? undefined : JSON.parse(options.body);
    db.calls.push({table, method, headers: {...options.headers}, body});
    const ok = (data, status = 200) => new Response(status === 204 ? null : JSON.stringify(data), {status});
    if (table === "rpc/best_man_check_attempt") return ok({allowed: !db.limited, retry_after: 30});
    if (table === "best_man_document") {
      if (method === "GET") return ok([structuredClone(db.doc)]);
      if (method === "PATCH") {
        if (parsed.searchParams.get("password_hash") === "is.null" && db.doc.password_hash !== null) return ok([]);
        const setup = parsed.searchParams.get("setup_token_hash");
        if (setup && setup !== `eq.${db.doc.setup_token_hash}`) return ok([]);
        const version = parsed.searchParams.get("version");
        if (version && version !== `eq.${db.doc.version}`) return ok([]);
        Object.assign(db.doc, structuredClone(body));
        return ok([structuredClone(db.doc)]);
      }
    }
    if (table === "best_man_sessions") {
      if (method === "POST") { db.sessions.set(body.token_hash, structuredClone(body)); return ok(null, 204); }
      const hash = parsed.searchParams.get("token_hash")?.slice(3);
      if (method === "DELETE") { db.sessions.delete(hash); return ok(null, 204); }
      if (method === "GET") {
        const row = db.sessions.get(hash);
        return ok(row && new Date(row.expires_at).getTime() > now ? [row] : []);
      }
    }
    throw new Error(`Unexpected mock request: ${method} ${table}`);
  }
  const handler = createHandler({fetchFn, now: () => now, env: name => ({
    SUPABASE_URL: "https://test.supabase.co",
    SUPABASE_SECRET_KEYS: modern ? JSON.stringify({default: "sb_secret_test_only"}) : undefined,
    SUPABASE_SERVICE_ROLE_KEY: "test.legacy.jwt",
  })[name]});
  async function call(action, {method = "GET", body, token, origin = ORIGIN, extraHeaders = {}} = {}) {
    const headers = {...extraHeaders};
    if (origin) headers.Origin = origin;
    if (body !== undefined) headers["Content-Type"] = "application/json";
    if (token) headers.Authorization = `Bearer ${token}`;
    const response = await handler(new Request(`${BASE}/${action}`, {
      method, headers, body: body === undefined ? undefined : JSON.stringify(body),
    }));
    return {response, data: response.status === 204 ? null : await response.json()};
  }
  return {db, handler, call, now};
}

test("status reveals only initialization and never leaks admin material", async () => {
  const {db, call} = await fixture();
  const {response, data} = await call("status");
  assert.equal(response.status, 200);
  assert.deepEqual(data, {initialized: false});
  assert.equal(response.headers.get("cache-control"), "no-store");
  for (const request of db.calls) {
    assert.equal(request.headers.apikey, "sb_secret_test_only");
    assert.equal(request.headers.Authorization, undefined);
  }
});

test("setup is claimed atomically and stores hashes rather than credentials", async () => {
  const {db, call} = await fixture();
  const attempts = await Promise.all([
    call("setup", {method: "POST", body: {setupToken: SETUP, password: PASSWORD}}),
    call("setup", {method: "POST", body: {setupToken: SETUP, password: PASSWORD}}),
  ]);
  assert.deepEqual(attempts.map(result => result.response.status).sort(), [200, 409]);
  const {data} = attempts.find(result => result.response.status === 200);
  assert.match(data.token, /^[a-f0-9]{64}$/);
  assert.equal(data.version, 0);
  assert.equal(data.data, null);
  assert.equal(db.doc.setup_token_hash, null);
  assert.notEqual(db.doc.password_hash, PASSWORD);
  assert.match(db.doc.password_salt, /^[a-f0-9]{32}$/);
  assert.equal(db.sessions.has(data.token), false);
  assert.equal(db.sessions.has(await sha256(data.token)), true);
  assert.equal(JSON.stringify(db.doc).includes(SETUP), false);
});

test("invalid setup token and wrong password never receive a session", async () => {
  const fresh = await fixture();
  const denied = await fresh.call("setup", {method: "POST", body: {setupToken: "x".repeat(64), password: PASSWORD}});
  assert.equal(denied.response.status, 403);
  assert.equal(fresh.db.doc.password_hash, null);
  const initialized = await fixture({initialized: true});
  const wrong = await initialized.call("login", {method: "POST", body: {password: "wrong password"}});
  assert.equal(wrong.response.status, 401);
  assert.equal(wrong.data.code, "invalid_credentials");
  assert.equal(initialized.db.sessions.size, 0);
});

test("login, authorized save, reload, stale-write conflict, and logout", async () => {
  const {db, call} = await fixture({initialized: true});
  const login = await call("login", {method: "POST", body: {password: PASSWORD}});
  assert.equal(login.response.status, 200);
  const token = login.data.token;
  const notebook = NotebookData.fresh();
  notebook.speech = "A story about my brother.";
  const save = await call("state", {method: "PUT", token, body: {data: notebook, expectedVersion: 0}});
  assert.equal(save.response.status, 200);
  assert.equal(save.data.version, 1);
  const loaded = await call("state", {token});
  assert.equal(loaded.data.data.speech, notebook.speech);
  const stale = await call("state", {method: "PUT", token, body: {data: {...notebook, speech: "stale"}, expectedVersion: 0}});
  assert.equal(stale.response.status, 409);
  assert.equal(stale.data.code, "version_conflict");
  assert.equal(db.doc.data.speech, notebook.speech);
  assert.equal((await call("logout", {method: "POST", token})).response.status, 200);
  assert.equal((await call("state", {token})).response.status, 401);
});

test("protected data requires an unexpired opaque session", async () => {
  const {db, call, now} = await fixture();
  for (const token of [undefined, "x".repeat(64), "1".repeat(64)]) {
    assert.equal((await call("state", {token})).response.status, 401);
  }
  const expiredToken = "2".repeat(64);
  db.sessions.set(await sha256(expiredToken), {token_hash: await sha256(expiredToken), expires_at: new Date(now - 1000).toISOString()});
  assert.equal((await call("state", {token: expiredToken})).response.status, 401);
  assert.equal(db.calls.some(request => request.table === "best_man_document"), false);
});

test("origin checks precede all database work and preflight is explicit", async () => {
  const {db, call} = await fixture();
  const denied = await call("login", {method: "POST", body: {password: PASSWORD}, origin: "https://untrusted.example"});
  assert.equal(denied.response.status, 403);
  assert.equal(denied.response.headers.get("access-control-allow-origin"), null);
  assert.equal(db.calls.length, 0);
  assert.equal((await call("login", {method: "POST", body: {password: PASSWORD}, origin: ""})).response.status, 403);
  const options = await call("state", {method: "OPTIONS"});
  assert.equal(options.response.status, 204);
  assert.equal(options.response.headers.get("access-control-allow-origin"), ORIGIN);
});

test("persistent rate-limit response has Retry-After and stores no raw address", async () => {
  const {db, call} = await fixture();
  db.limited = true;
  const result = await call("login", {method: "POST", body: {password: PASSWORD}, extraHeaders: {"cf-connecting-ip": "192.0.2.17"}});
  assert.equal(result.response.status, 429);
  assert.equal(result.response.headers.get("retry-after"), "30");
  assert.match(db.calls[0].body.p_ip_hash, /^[a-f0-9]{64}$/);
  assert.equal(JSON.stringify(db.calls).includes("192.0.2.17"), false);
});

test("notebook schema validates the real frontend shape and rejects corruption", () => {
  const notebook = NotebookData.fresh();
  assert.deepEqual(validateData(notebook), notebook);
  assert.throws(() => validateData({...notebook, version: 2}));
  assert.throws(() => validateData({...notebook, details: null}));
  assert.throws(() => validateData({...notebook, extra: "unexpected"}));
  assert.throws(() => validateData({...notebook, speech: "a".repeat(100001)}));
  assert.throws(() => validateData({...notebook, details: {...notebook.details, weddingDate: "2026-02-30"}}));
  const polluted = JSON.parse(JSON.stringify(notebook).replace('"details":{', '"details":{"__proto__":{},'));
  assert.throws(() => validateData(polluted));
});

test("legacy admin environment remains supported without passing caller tokens through", async () => {
  const {db, call} = await fixture({modern: false});
  assert.equal((await call("status")).response.status, 200);
  assert.equal(db.calls[0].headers.apikey, "test.legacy.jwt");
  assert.equal(db.calls[0].headers.Authorization, "Bearer test.legacy.jwt");
});
