"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const Data = require("../daily_flyer/themes/best_man_assets/store.js");
const Cloud = require("../daily_flyer/themes/best_man_assets/cloud.js");
const TOKEN = "fake-test-session-token-0123456789";
const NOW = Date.parse("2026-11-11T12:00:00.000Z");
const EXPIRY = "2026-12-11T12:00:00.000Z";

function storage() {
  const values = new Map();
  return {
    getItem(key) { return values.has(key) ? values.get(key) : null; },
    setItem(key, value) { values.set(key, String(value)); },
    removeItem(key) { values.delete(key); },
  };
}

function response(status, body, headers = {}) {
  return new Response(typeof body === "string" ? body : JSON.stringify(body), {status, headers: {"Content-Type": "application/json", ...headers}});
}

function client(fetch, sessionStorage = storage(), extra = {}) {
  return Cloud.createClient({fetch, sessionStorage, now: () => NOW, ...extra});
}

function auth(data = null, version = 0) {
  return {token: TOKEN, expiresAt: EXPIRY, data, version};
}

test("setup/password are sent only in a JSON body and only an opaque session is retained", async () => {
  const sessionStorage = storage();
  const seen = [];
  const c = client(async (url, options) => {
    seen.push({url, options});
    if (url.endsWith("/status")) return response(200, {initialized: false});
    return response(200, auth());
  }, sessionStorage);
  assert.deepEqual(await c.status(), {initialized: false});
  const result = await c.setup("one-time-setup-token-1234", "A private passphrase");
  assert.equal(result.version, 0);
  assert.equal(result.token, undefined);
  assert.equal(c.hasSession(), true);
  const request = seen[1];
  assert.equal(request.url, Cloud.ENDPOINT + "/setup");
  assert.equal(request.options.headers.Authorization, undefined);
  assert.deepEqual(JSON.parse(request.options.body), {setupToken: "one-time-setup-token-1234", password: "A private passphrase"});
  for (const {url, options} of seen) {
    assert.ok(!url.includes("private") && !url.includes("setup-token"));
    assert.equal(options.credentials, "omit");
    assert.equal(options.cache, "no-store");
    assert.equal(options.redirect, "error");
    assert.equal(options.referrerPolicy, "no-referrer");
  }
  const saved = sessionStorage.getItem(Cloud.SESSION_KEY);
  assert.deepEqual(JSON.parse(saved), {token: TOKEN, expiresAt: EXPIRY});
  assert.ok(!saved.includes("passphrase"));
});

test("login validates and returns saved data, then load/save use a Bearer token and expected revision", async () => {
  const state = Data.fresh();
  state.speech = "A toast";
  const seen = [];
  const c = client(async (url, options) => {
    seen.push({url, options});
    if (url.endsWith("/login")) return response(200, auth(state, 4));
    if (options.method === "PUT") return response(200, {version: 5, updatedAt: "2026-11-11T12:01:00.000Z"});
    return response(200, {data: state, version: 4});
  });
  assert.deepEqual((await c.login("my password")).data, state);
  assert.deepEqual(await c.load(), {data: state, version: 4});
  assert.deepEqual(await c.save(state, 4), {version: 5, updatedAt: "2026-11-11T12:01:00.000Z"});
  assert.equal(seen[1].options.headers.Authorization, `Bearer ${TOKEN}`);
  assert.equal(seen[2].options.headers.Authorization, `Bearer ${TOKEN}`);
  assert.deepEqual(JSON.parse(seen[2].options.body), {data: state, expectedVersion: 4});
});

test("401 locks the client and clears only its session, leaving notebook data and unrelated keys alone", async () => {
  const sessionStorage = storage();
  sessionStorage.setItem("unrelated", "keep");
  sessionStorage.setItem(Data.KEY, "notebook-material");
  let reject = false;
  const c = client(async () => reject ? response(401, {code: "unauthorized", error: "do not show raw details"}) : response(200, auth()), sessionStorage);
  await c.login("my password");
  reject = true;
  await assert.rejects(c.load(), {code: "LOCKED", status: 401});
  assert.equal(c.hasSession(), false);
  assert.equal(sessionStorage.getItem(Cloud.SESSION_KEY), null);
  assert.equal(sessionStorage.getItem(Data.KEY), "notebook-material");
  assert.equal(sessionStorage.getItem("unrelated"), "keep");
});

test("conflicts and rate limits are explicit and never silently retried", async () => {
  let mode = "login";
  let requests = 0;
  const c = client(async () => {
    requests += 1;
    if (mode === "login") return response(200, auth());
    if (mode === "conflict") return response(409, {code: "version_conflict", error: "raw server detail"});
    return response(429, {code: "rate_limited"}, {"Retry-After": "45"});
  });
  await c.login("my password");
  mode = "conflict";
  const state = Data.fresh();
  state.speech = "Unsaved edits";
  await assert.rejects(c.save(state, 2), {code: "CONFLICT", status: 409, retryable: false});
  assert.equal(state.speech, "Unsaved edits");
  assert.equal(requests, 2);
  mode = "rate";
  await assert.rejects(c.load(), {code: "RATE_LIMITED", status: 429, retryAfter: 45, retryable: true});
  assert.equal(requests, 3);
});

test("timeout aborts the request and exposes a safe retryable error", async () => {
  let aborted = false;
  const c = client((_url, options) => new Promise((_resolve, reject) => {
    options.signal.addEventListener("abort", () => {
      aborted = true;
      reject(new DOMException("Aborted", "AbortError"));
    });
  }), storage(), {timeoutMs: 12});
  await assert.rejects(c.status(), {code: "TIMEOUT", retryable: true});
  assert.equal(aborted, true);
});

test("invalid saved data, revisions, or sessions are rejected before unlocking", async () => {
  for (const bad of [auth({version: 1}, 0), {...auth(), token: "bad"}, {...auth(), expiresAt: "not-a-date"}, {...auth(), version: -1}]) {
    const c = client(async () => response(200, bad));
    await assert.rejects(c.login("my password"), {code: "INVALID_RESPONSE"});
    assert.equal(c.hasSession(), false);
  }
  const c = client(async () => response(200, "not JSON"));
  await assert.rejects(c.status(), {code: "INVALID_RESPONSE"});
});

test("sessionStorage failure permits a memory-only session and passwords are still not persisted", async () => {
  const broken = {getItem() {throw new Error("denied");}, setItem() {throw new Error("denied");}, removeItem() {throw new Error("denied");}};
  const c = client(async () => response(200, auth()), broken);
  const result = await c.login("my password");
  assert.equal(result.sessionStored, false);
  assert.equal(c.hasSession(), true);
});

test("expired or malformed sessions are cleared without making a protected request", async () => {
  for (const saved of ["{broken", JSON.stringify({token: TOKEN, expiresAt: "2026-01-01T00:00:00.000Z"})]) {
    const savedStorage = storage();
    savedStorage.setItem(Cloud.SESSION_KEY, saved);
    let called = false;
    const c = client(async () => { called = true; return response(200, {}); }, savedStorage);
    assert.equal(c.init().hasSession, false);
    await assert.rejects(c.load(), {code: "LOCKED"});
    assert.equal(called, false);
    assert.equal(savedStorage.getItem(Cloud.SESSION_KEY), null);
  }
});

test("logout clears local access immediately, revokes the captured token, and does not delete notebook data", async () => {
  const sessionStorage = storage();
  sessionStorage.setItem(Data.KEY, "keep my notes");
  let sawLogout = false;
  const c = client(async (url, options) => {
    if (url.endsWith("/login")) return response(200, auth());
    assert.equal(c.hasSession(), false);
    assert.equal(options.headers.Authorization, `Bearer ${TOKEN}`);
    sawLogout = true;
    return response(200, {ok: true});
  }, sessionStorage);
  await c.login("my password");
  assert.deepEqual(await c.logout(), {ok: true, revoked: true, sessionCleared: true});
  assert.equal(sawLogout, true);
  assert.equal(sessionStorage.getItem(Data.KEY), "keep my notes");
});

test("failed remote logout is honestly reported while this tab remains locked", async () => {
  const c = client(async url => {
    if (url.endsWith("/login")) return response(200, auth());
    throw new Error("network down");
  });
  await c.login("my password");
  const result = await c.logout();
  assert.equal(result.revoked, false);
  assert.ok(result.warning);
  assert.equal(c.hasSession(), false);
});

test("a late login response cannot unlock a tab that was locked while sign-in was pending", async () => {
  let finish;
  const c = client(() => new Promise(resolve => { finish = resolve; }));
  const pending = c.login("my password");
  await c.logout();
  finish(response(200, auth()));
  await assert.rejects(pending, {code: "CANCELED"});
  assert.equal(c.hasSession(), false);
});
