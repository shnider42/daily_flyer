import test from 'node:test';
import assert from 'node:assert/strict';
import { FarwakeNetwork, readRealmStartOptions } from '../dist/network.mjs';
import { WORLD_CONTENT_VERSION } from '../dist/world-content.mjs';

test('the transport sends a Casual origin on fresh create/join and scopes the chosen galaxy seed to creation', async () => {
  const requests = [], network = () => new FarwakeNetwork({ url: 'https://galaxy.example.test', storage: null, autoReconnect: false,
    fetchImpl: async (url, options) => { if(url.endsWith('/api/config'))return new Response(JSON.stringify({ok:true,worldContentVersion:WORLD_CONTENT_VERSION}));requests.push({ url, options, body: JSON.parse(options.body) }); return new Response(JSON.stringify({ ok: false, reason: 'Stop before opening a session' }), { status: 503 }); }
  });
  await assert.rejects(network().connect({ create: true, name: 'Host', galaxySeed: 'preview-seed', startMode: 'casual', startSystemId: 'brindle' }), /Stop before/);
  await assert.rejects(network().connect({ realmCode: 'ABCD1234', name: 'Guest', galaxySeed: 'must-not-reseed', startMode: 'casual', startSystemId: 'vesper' }), /Stop before/);
  assert.equal(requests[0].body.action, 'create'); assert.equal(requests[0].body.galaxySeed, 'preview-seed');
  assert.equal(requests[0].body.startMode, 'casual'); assert.equal(requests[0].body.startSystemId, 'brindle');
  assert.equal(requests[1].body.action, 'join'); assert.equal(requests[1].body.startMode, 'casual'); assert.equal(requests[1].body.startSystemId, 'vesper');
  assert.equal(Object.hasOwn(requests[1].body, 'galaxySeed'), false);
  for (const request of requests) { assert.equal(request.options.credentials, 'omit'); assert.equal(request.options.cache, 'no-store'); }
});

test('shared origin lookup is a cancellable read and reports missing galaxies instead of inventing a catalog', async () => {
  const controller = new AbortController(), calls = [], response = { ok: true, seed: 'the-actual-realm', settings: { openingMission: true, startTogether: false } };
  const result = await readRealmStartOptions({ url: 'https://galaxy.example.test/', realmCode: 'ABCD1234', signal: controller.signal,
    fetchImpl: async (url, options) => { calls.push({ url, options }); return new Response(JSON.stringify(response)); }
  });
  assert.equal(result.seed, response.seed); assert.deepEqual(result.settings, response.settings);
  assert.equal(calls[0].url, 'https://galaxy.example.test/api/realms/ABCD1234/start-options');
  assert.equal(calls[0].options.method || 'GET', 'GET'); assert.equal(calls[0].options.signal, controller.signal);
  assert.equal(calls[0].options.credentials, 'omit'); assert.equal(calls[0].options.cache, 'no-store'); assert.equal(calls[0].options.body, undefined);
  await assert.rejects(readRealmStartOptions({ url: 'https://galaxy.example.test', realmCode: 'ABSENT77', fetchImpl: async () => new Response(JSON.stringify({ ok: false, reason: 'That realm code was not found.' }), { status: 404 }) }), /not found/);
  await assert.rejects(readRealmStartOptions({ url: 'https://galaxy.example.test', realmCode: 'ABCD1234', fetchImpl: async () => new Response(JSON.stringify({ ok: true, settings: {} })) }));
});
