import test from 'node:test';
import assert from 'node:assert/strict';
import { openPrivacyData } from '../dist/privacy-ui.mjs';
import { BROWSER_DATA_KEYS as KEYS } from '../dist/privacy-data.mjs';

const one = { realmCode: 'GALAXY01', captainId: 'captain_one', token: 'private-one-123456789012345678901234567' };
const two = { realmCode: 'GALAXY02', captainId: 'captain_two', token: 'private-two-123456789012345678901234567' };
function fixture({ currentPassport = null, request, storageBlocked = false } = {}) {
  const elements = new Map(), downloads = [], requests = [];
  const element = () => ({ textContent: '', value: '', disabled: false, children: [], attributes: {}, append(value) { this.children.push(value); }, setAttribute(key, value) { this.attributes[key] = value; } });
  const document = { getElementById(id) { if (!elements.has(id)) elements.set(id, element()); return elements.get(id); }, createElement: element };
  const entries = new Map([[KEYS.passports, JSON.stringify({ GALAXY01: one, GALAXY02: two, lastRealm: 'GALAXY02' })]]);
  const storage = { get length() { return entries.size; }, key: index => [...entries.keys()][index], getItem: key => entries.get(key) ?? null };
  const dialog = { opened: false, kind: null, markup: '', open(_title, kind) { this.opened = true; this.kind = kind; }, html(markup) { this.markup = markup; } };
  openPrivacyData(dialog, { serverURL: 'https://galaxy.example.test', currentPassport, document, getStorage: () => { if (storageBlocked) throw new Error('blocked'); return storage; }, download: (report, filename) => downloads.push({ report, filename }), request: async args => { requests.push(args); return request ? request(args) : { scope: { captainId: args.passport.captainId } }; } });
  return { elements, downloads, requests, dialog, get: id => document.getElementById(id) };
}

test('privacy panel makes no server request on open and requires choosing a saved captain', async () => {
  const f = fixture();
  assert.equal(f.requests.length, 0); assert.equal(f.downloads.length, 0);
  assert.equal(f.get('privacyServerDownload').disabled, true);
  const options = f.get('privacyCaptain').children;
  assert.equal(options.length, 2);
  for (const option of options) { assert.ok(!option.value.includes(one.token)); assert.ok(!option.textContent.includes(two.token)); }
  assert.ok(!f.dialog.markup.includes(one.token));
  f.get('privacyCaptain').value = 'GALAXY02:captain_two'; f.get('privacyCaptain').onchange();
  assert.equal(f.get('privacyServerDownload').disabled, false);
  await f.get('privacyServerDownload').onclick();
  assert.equal(f.requests.length, 1); assert.deepEqual(f.requests[0].passport, two);
  assert.equal(f.downloads.length, 0);
  assert.equal(f.get('privacyServerDownload').textContent, 'Download captain’s server data');
  assert.match(f.get('privacyServerStatus').textContent, /Captain report ready/);
  const save = f.get('privacyServerDownload').onclick();
  // The second click starts the download synchronously, before any await loses the gesture.
  assert.equal(f.downloads.length, 1); assert.equal(f.downloads[0].report.scope.captainId, 'captain_two');
  await save;
  assert.equal(f.requests.length, 1);
  assert.match(f.get('privacyServerStatus').textContent, /Download started/);
  assert.match(f.get('privacyServerStatus').textContent, /Browser-only records are a separate download/);
  f.get('privacyCaptain').value = 'GALAXY01:captain_one'; f.get('privacyCaptain').onchange();
  assert.equal(f.get('privacyServerDownload').textContent, 'Get captain’s server data');
  await f.get('privacyServerDownload').onclick();
  assert.equal(f.requests.length, 2); assert.deepEqual(f.requests[1].passport, one);
  assert.equal(f.downloads.length, 1, 'changing captain never saves the previously prepared captain report');
});

test('server failure is explicit and cannot trigger a misleading local fallback download', async () => {
  const f = fixture({ currentPassport: one, request: async () => { throw new Error('The server is unavailable. No server data report was downloaded.'); } });
  await f.get('privacyServerDownload').onclick();
  assert.equal(f.downloads.length, 0);
  assert.match(f.get('privacyServerStatus').textContent, /No server data report was downloaded/);
  assert.equal(f.get('privacyServerDownload').disabled, false);
  f.get('privacyBrowserDownload').onclick();
  assert.equal(f.downloads.length, 1);
  assert.equal(f.downloads[0].report.scope.kind, 'this-browser');
  assert.equal(f.downloads[0].report.scope.includesServerData, false);
  assert.match(f.get('privacyBrowserStatus').textContent, /Download started/);
  assert.match(f.get('privacyBrowserStatus').textContent, /no shared-galaxy server data/);
});

test('closing a pending report prevents a late download; repeated clicks issue only one request', async () => {
  let release;
  const f = fixture({ currentPassport: one, request: () => new Promise(resolve => { release = resolve; }) });
  const pending = f.get('privacyServerDownload').onclick();
  await f.get('privacyServerDownload').onclick();
  assert.equal(f.requests.length, 1);
  f.dialog.opened = false; f.dialog.kind = null;
  release({ scope: { captainId: one.captainId } });
  await pending;
  assert.equal(f.downloads.length, 0);
});

test('blocked browser storage reports the limitation but still permits the explicitly active captain', async () => {
  const f = fixture({ currentPassport: one, storageBlocked: true });
  assert.match(f.get('privacyCaptainHelp').textContent, /could not be read/);
  assert.equal(f.get('privacyServerDownload').disabled, false);
  f.get('privacyBrowserDownload').onclick();
  assert.equal(f.downloads.length, 0);
  await f.get('privacyServerDownload').onclick();
  assert.equal(f.requests.length, 1); assert.deepEqual(f.requests[0].passport, one);
  assert.equal(f.downloads.length, 0);
  await f.get('privacyServerDownload').onclick();
  assert.equal(f.downloads.length, 1);
});
