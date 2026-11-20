import test from 'node:test';
import assert from 'node:assert/strict';
import { createHandler } from './index.ts';

const environment = name => ({ SUPABASE_URL: 'https://database.example.test', SUPABASE_SECRET_KEYS: JSON.stringify({ default: 'sb_secret_test_only' }) })[name];
const request = (body, extra = {}) => new Request('https://api.example.test/lmw-connect', {
  method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'https://dfe-lmw.onrender.com', ...extra }, body: JSON.stringify(body),
});

test('all organizer actions reject a missing capability before touching the database', async () => {
  let calls = 0;
  const handler = createHandler(environment, async () => { calls++; throw new Error('must not reach database'); });
  for (const action of ['admin_list','admin_update','admin_delete','event_update']) {
    const response = await handler(request({ action }));
    assert.equal(response.status, 401);
  }
  assert.equal(calls, 0);
});

test('a random organizer key is checked against the isolated organizer table', async () => {
  const handler = createHandler(environment, async (url, options) => {
    assert.ok(url.startsWith('https://database.example.test/rest/v1/lmw_organizer_keys?'));
    assert.equal(options.headers.apikey, 'sb_secret_test_only');
    assert.equal(options.headers.Authorization, undefined, 'new secret keys must not be sent as JWTs');
    assert.ok(!url.includes('a'.repeat(64)), 'raw organizer key is not sent to the data API');
    return Response.json([]);
  });
  const response = await handler(request({ action: 'admin_list' }, { 'X-LMW-Organizer-Key': 'a'.repeat(64) }));
  assert.equal(response.status, 401);
});

test('private management requires both the record id and matching hashed token', async () => {
  const handler = createHandler(environment, async (url) => {
    const params = new URL(url).searchParams;
    assert.equal(params.get('id'), 'eq.843e47b6-3a8e-46df-b055-dc24238842e5');
    assert.equal(params.get('event_slug'), 'eq.networking-night');
    assert.match(params.get('manage_token_hash'), /^eq\.[a-f0-9]{64}$/);
    assert.ok(!params.get('select').includes('manage_token_hash'));
    assert.match(params.get('expires_at'), /^gt\./);
    return Response.json([]);
  });
  const response = await handler(request({ action: 'manage_get', id: '843e47b6-3a8e-46df-b055-dc24238842e5', manage_token: 'a'.repeat(64) }));
  assert.equal(response.status, 404);
});

test('a browser request from an unapproved origin cannot cause database operations', async () => {
  let calls = 0;
  const handler = createHandler(environment, async () => { calls++; return Response.json([]); });
  const response = await handler(request({ action: 'submit' }, { Origin: 'https://unrelated.example.test' }));
  assert.equal(response.status, 403);
  assert.equal(response.headers.get('Access-Control-Allow-Origin'), null);
  assert.equal(calls, 0);
});

test('submissions send only hashed capabilities and HMAC network buckets to the database', async () => {
  const rawToken = 'a'.repeat(64);
  const handler = createHandler(environment, async (url, options) => {
    assert.equal(url, 'https://database.example.test/rest/v1/rpc/lmw_submit');
    const payload = JSON.parse(options.body);
    assert.match(payload.p_hash, /^[a-f0-9]{64}$/);
    assert.notEqual(payload.p_hash, rawToken);
    assert.match(payload.p_bucket, /^[a-f0-9]{64}$/);
    assert.ok(!options.body.includes('192.0.2.10'));
    assert.ok(!options.body.includes('status'));
    return Response.json('created');
  });
  const response = await handler(request({ action: 'submit', event_slug: 'networking-night', id: '843e47b6-3a8e-46df-b055-dc24238842e5', manage_token: rawToken, website: '', data: {
    first_name: 'Test', last_name: 'Person', graduate_year: '2020', email: 'test@example.com', engagement: 'maybe', interests: ['committee'],
    contact_permission: 'none', phone_permission: false, privacy_consent: true, status: 'connected',
  } }, { 'x-forwarded-for': '192.0.2.10' }));
  assert.equal(response.status, 201);
  const result = await response.json();
  assert.equal(result.ok, true);
  assert.equal(result.manage_token, undefined);
});

test('an authorized edited retry is acknowledged only when the RPC confirms an update', async () => {
  const handler = createHandler(environment, async (url, options) => {
    assert.equal(url, 'https://database.example.test/rest/v1/rpc/lmw_submit');
    const payload = JSON.parse(options.body);
    assert.equal(payload.p_data.contact_permission, 'none');
    assert.equal(payload.p_data.phone_permission, false);
    return Response.json('updated');
  });
  const response = await handler(request({ action: 'submit', event_slug: 'networking-night',
    id: '843e47b6-3a8e-46df-b055-dc24238842e5', manage_token: 'a'.repeat(64), website: '', data: {
      first_name: 'Test', last_name: 'Person', graduate_year: '2020', email: 'test@example.com',
      engagement: 'not_now', interests: [], contact_permission: 'none', phone_permission: false, privacy_consent: true,
    },
  }));
  assert.equal(response.status, 200);
  assert.equal((await response.json()).ok, true);
});
