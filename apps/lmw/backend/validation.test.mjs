import test from 'node:test';
import assert from 'node:assert/strict';
import { validateResponse, validateIdentity, readJsonBody } from './validation.mjs';

const good = {
  first_name: 'Test', last_name: 'Person', graduate_year: '2020', email: 'Test@example.com',
  phone: '', current_employer: '', engagement: 'yes', interests: ['committee'], availability: '',
  help_needed: '', contact_permission: 'email', phone_permission: false, privacy_consent: true,
};

test('consent is explicit; an email address alone is insufficient', () => {
  assert.throws(() => validateResponse({ ...good, contact_permission: undefined }), /choose/);
  assert.throws(() => validateResponse({ ...good, privacy_consent: false }), /confirm/);
  assert.throws(() => validateResponse({ ...good, privacy_consent: 'true' }), /confirm/);
});

test('no-follow-up forcibly removes phone permission and Not now clears interests', () => {
  const response = validateResponse({ ...good, engagement: 'not_now', contact_permission: 'none', phone: '617-555-0100', phone_permission: true });
  assert.deepEqual(response.interests, []);
  assert.equal(response.phone_permission, false);
  assert.equal(response.email, 'test@example.com');
});

test('validating cannot smuggle organizer state or a token into persisted participant fields', () => {
  const response = validateResponse({ ...good, status: 'connected', note: 'Secret note', manage_token_hash: 'hijack', event_slug: 'another' });
  assert.equal(response.status, undefined);
  assert.equal(response.note, undefined);
  assert.equal(response.manage_token_hash, undefined);
  assert.equal(response.event_slug, undefined);
});

test('handles class-year exceptions but rejects future years and unknown interest values', () => {
  assert.equal(validateResponse({ ...good, graduate_year: 'current' }, 2026).graduate_year, 'current');
  assert.equal(validateResponse({ ...good, graduate_year: 'unknown' }, 2026).graduate_year, 'unknown');
  assert.throws(() => validateResponse({ ...good, graduate_year: '2027' }, 2026), /graduate year/);
  assert.throws(() => validateResponse({ ...good, interests: ['admin'] }), /interests/);
  assert.throws(() => validateResponse({ ...good, first_name: 'A\nB' }), /first name/);
  assert.throws(() => validateResponse({ ...good, help_needed: 'x'.repeat(701) }), /700/);
});

test('private links require both a UUIDv4 and 256 bits of hexadecimal token material', () => {
  assert.throws(() => validateIdentity({ id: 'a', manage_token: 'password' }), /invalid/);
  const identity = { id: '843e47b6-3a8e-46df-b055-dc24238842e5', manage_token: 'a'.repeat(64) };
  assert.deepEqual(validateIdentity(identity), identity);
});

test('body limit counts actual streamed bytes when content length is omitted', async () => {
  const request = new Request('https://example.test', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ value: 'x'.repeat(13000) }),
  });
  await assert.rejects(readJsonBody(request), error => error.status === 413);
});

test('rejects non-object JSON and wrong content types', async () => {
  await assert.rejects(readJsonBody(new Request('https://example.test', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '[]' })), error => error.status === 400);
  await assert.rejects(readJsonBody(new Request('https://example.test', { method: 'POST', body: '{}' })), error => error.status === 415);
});
