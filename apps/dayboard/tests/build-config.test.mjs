import test from 'node:test';
import assert from 'node:assert/strict';
import {resolveTeamConfig} from '../build-config.mjs';

const ready = {
  DAYBOARD_TEAMS_ENABLED: 'true',
  DAYBOARD_SUPABASE_URL: 'https://example.supabase.co/',
  DAYBOARD_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_synthetic_test_only',
  DAYBOARD_EMAIL_PROVIDER: 'Test email provider',
  DAYBOARD_AUTH_ADMISSION_VERIFIED: 'true',
  DAYBOARD_SMTP_VERIFIED: 'true',
};

test('disabled releases expose no backend or email-provider configuration', () => {
  assert.deepEqual(resolveTeamConfig({}, {...ready, DAYBOARD_TEAMS_ENABLED: 'false'}), {enabled: false, url: '', publishableKey: '', emailProvider: ''});
  assert.deepEqual(resolveTeamConfig(), {enabled: false, url: '', publishableKey: '', emailProvider: ''});
});

test('enabled releases require the named email provider and recorded admission/delivery checks', () => {
  for (const key of ['DAYBOARD_EMAIL_PROVIDER', 'DAYBOARD_AUTH_ADMISSION_VERIFIED', 'DAYBOARD_SMTP_VERIFIED']) {
    const env = {...ready}; delete env[key];
    assert.throws(() => resolveTeamConfig({}, env), new RegExp(key));
  }
  assert.deepEqual(resolveTeamConfig({}, ready), {enabled: true, url: 'https://example.supabase.co', publishableKey: ready.DAYBOARD_SUPABASE_PUBLISHABLE_KEY, emailProvider: 'Test email provider'});
});

test('release configuration rejects privileged keys and non-origin backend URLs', () => {
  for (const key of ['sb_secret_do_not_publish', 'eyJserviceRoleExample', 'sb_publishable_test\nsecret']) {
    assert.throws(() => resolveTeamConfig({}, {...ready, DAYBOARD_SUPABASE_PUBLISHABLE_KEY: key}), /publishable API key/);
  }
  for (const url of ['http://example.supabase.co', 'https://user:password@example.supabase.co', 'https://example.supabase.co/path', 'https://example.supabase.co?secret=value']) {
    assert.throws(() => resolveTeamConfig({}, {...ready, DAYBOARD_SUPABASE_URL: url}), /HTTPS origin/);
  }
});
